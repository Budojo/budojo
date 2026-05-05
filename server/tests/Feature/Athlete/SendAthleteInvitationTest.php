<?php

declare(strict_types=1);

use App\Mail\AthleteInvitationMail;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthleteInvitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Mail::fake();
    RateLimiter::clear('throttle:5,1');
});

afterEach(function (): void {
    RateLimiter::clear('throttle:5,1');
});

function ownerWithRosterAthlete(?string $email = 'mario@example.com'): array
{
    $owner = User::factory()->create(['email_verified_at' => now()]);
    /** @var Academy $academy */
    $academy = Academy::factory()->for($owner, 'owner')->create();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create([
        'email' => $email,
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
    ]);

    return [$owner, $academy, $athlete];
}

it('persists a pending invitation row and queues the mail', function (): void {
    [$owner, , $athlete] = ownerWithRosterAthlete('newathlete@example.com');

    $this->actingAs($owner)
        ->postJson("/api/v1/athletes/{$athlete->id}/invite")
        ->assertCreated()
        ->assertJsonStructure(['data' => ['id', 'email', 'state', 'expires_at']])
        ->assertJsonPath('data.email', 'newathlete@example.com')
        ->assertJsonPath('data.state', 'pending');

    expect(AthleteInvitation::query()->count())->toBe(1);

    /** @var AthleteInvitation $invitation */
    $invitation = AthleteInvitation::query()->first();
    expect($invitation->athlete_id)->toBe($athlete->id);
    expect($invitation->academy_id)->toBe($athlete->academy_id);
    expect($invitation->sent_by_user_id)->toBe($owner->id);
    expect($invitation->isPending())->toBeTrue();
    // Token is hashed at rest.
    expect($invitation->token)->toMatch('/^[a-f0-9]{64}$/');

    Mail::assertQueued(AthleteInvitationMail::class, function (AthleteInvitationMail $mail) use ($athlete): bool {
        expect($mail->hasTo('newathlete@example.com'))->toBeTrue();
        // Raw token is the bearer credential — present on the Mailable
        // for the URL stitching, but never on the row.
        expect(strlen($mail->rawToken))->toBe(64);

        return true;
    });
});

it('rejects with 422 when the athlete has no email on file', function (): void {
    [$owner, , $athlete] = ownerWithRosterAthlete(null);

    $this->actingAs($owner)
        ->postJson("/api/v1/athletes/{$athlete->id}/invite")
        ->assertStatus(422)
        ->assertJsonValidationErrors(['email']);

    expect(AthleteInvitation::query()->count())->toBe(0);
    Mail::assertNothingQueued();
});

it('rejects with 422 when the athlete email already has a Budojo user', function (): void {
    [$owner, , $athlete] = ownerWithRosterAthlete('squatter@example.com');
    User::factory()->create(['email' => 'squatter@example.com']);

    $this->actingAs($owner)
        ->postJson("/api/v1/athletes/{$athlete->id}/invite")
        ->assertStatus(422)
        ->assertJsonValidationErrors(['email']);

    expect(AthleteInvitation::query()->count())->toBe(0);
    Mail::assertNothingQueued();
});

it('re-uses a pending invitation on resend (no parallel tokens)', function (): void {
    [$owner, , $athlete] = ownerWithRosterAthlete();

    $this->actingAs($owner)
        ->postJson("/api/v1/athletes/{$athlete->id}/invite")
        ->assertCreated();

    $original = AthleteInvitation::query()->firstOrFail();

    // Resend bumps last_sent_at + replaces the token hash, but does
    // NOT spawn a second pending row.
    $this->travel(1)->minutes();
    $this->actingAs($owner)
        ->postJson("/api/v1/athletes/{$athlete->id}/invite/resend")
        ->assertOk();

    expect(AthleteInvitation::query()->count())->toBe(1);

    /** @var AthleteInvitation $refreshed */
    $refreshed = AthleteInvitation::query()->firstOrFail();
    expect($refreshed->id)->toBe($original->id);
    expect($refreshed->token)->not->toBe($original->token);
    expect($refreshed->last_sent_at?->greaterThan($original->last_sent_at))->toBeTrue();

    Mail::assertQueued(AthleteInvitationMail::class, 2);
});

it('revokes a pending invitation via DELETE without dropping the row', function (): void {
    [$owner, , $athlete] = ownerWithRosterAthlete();

    $this->actingAs($owner)
        ->postJson("/api/v1/athletes/{$athlete->id}/invite")
        ->assertCreated();

    /** @var AthleteInvitation $invitation */
    $invitation = AthleteInvitation::query()->firstOrFail();

    $this->actingAs($owner)
        ->deleteJson("/api/v1/athletes/{$athlete->id}/invitations/{$invitation->id}")
        ->assertNoContent();

    $invitation->refresh();
    expect($invitation->isRevoked())->toBeTrue();
    expect($invitation->isPending())->toBeFalse();
    // Row is preserved as audit trail, not deleted.
    expect(AthleteInvitation::query()->count())->toBe(1);
});

it('revoke is idempotent on already-terminal invites', function (): void {
    [$owner, , $athlete] = ownerWithRosterAthlete();

    /** @var AthleteInvitation $accepted */
    $accepted = AthleteInvitation::factory()
        ->for($athlete)
        ->state(['academy_id' => $athlete->academy_id, 'sent_by_user_id' => $owner->id])
        ->accepted()
        ->create();

    $this->actingAs($owner)
        ->deleteJson("/api/v1/athletes/{$athlete->id}/invitations/{$accepted->id}")
        ->assertNoContent();

    // accepted_at stays set; revoked_at remains null.
    $accepted->refresh();
    expect($accepted->isAccepted())->toBeTrue();
    expect($accepted->isRevoked())->toBeFalse();
});

it('rejects DELETE when the invitation does not belong to the path athlete (404)', function (): void {
    [$owner, $academy, $athleteA] = ownerWithRosterAthlete();
    /** @var Athlete $athleteB */
    $athleteB = Athlete::factory()->for($academy)->create([
        'email' => 'b@example.com',
    ]);

    /** @var AthleteInvitation $invitation */
    $invitation = AthleteInvitation::factory()
        ->for($athleteB)
        ->state(['academy_id' => $academy->id, 'sent_by_user_id' => $owner->id])
        ->create();

    $this->actingAs($owner)
        ->deleteJson("/api/v1/athletes/{$athleteA->id}/invitations/{$invitation->id}")
        ->assertStatus(404);
});

it('rejects with 403 when the caller is not the academy owner', function (): void {
    [, , $athlete] = ownerWithRosterAthlete();

    /** @var User $intruder */
    $intruder = User::factory()->create(['email_verified_at' => now()]);
    Academy::factory()->for($intruder, 'owner')->create();

    $this->actingAs($intruder)
        ->postJson("/api/v1/athletes/{$athlete->id}/invite")
        ->assertStatus(403);

    expect(AthleteInvitation::query()->count())->toBe(0);
});

it('rejects with 403 when the caller is an athlete user (not owner)', function (): void {
    [, , $athlete] = ownerWithRosterAthlete();

    /** @var User $athleteUser */
    $athleteUser = User::factory()->athlete()->create(['email_verified_at' => now()]);

    $this->actingAs($athleteUser)
        ->postJson("/api/v1/athletes/{$athlete->id}/invite")
        ->assertStatus(403);
});

it('rejects with 401 when unauthenticated', function (): void {
    [, , $athlete] = ownerWithRosterAthlete();

    $this->postJson("/api/v1/athletes/{$athlete->id}/invite")
        ->assertStatus(401);
});

it('persists the row even when the queue insert blows up (best-effort mail)', function (): void {
    Mail::shouldReceive('to')->andThrow(new RuntimeException('queue down'));

    [$owner, , $athlete] = ownerWithRosterAthlete();

    $this->actingAs($owner)
        ->postJson("/api/v1/athletes/{$athlete->id}/invite")
        ->assertCreated();

    expect(AthleteInvitation::query()->count())->toBe(1);
});

it('throttles the invite endpoint at 5 requests per minute', function (): void {
    [$owner, $academy] = ownerWithRosterAthlete();

    // Five different athletes in the same academy so each has a fresh
    // email + roster row to invite.
    for ($i = 0; $i < 5; $i++) {
        /** @var Athlete $athlete */
        $athlete = Athlete::factory()->for($academy)->create([
            'email' => "throttle-{$i}@example.com",
        ]);
        $this->actingAs($owner)
            ->postJson("/api/v1/athletes/{$athlete->id}/invite")
            ->assertCreated();
    }

    /** @var Athlete $sixth */
    $sixth = Athlete::factory()->for($academy)->create(['email' => 'throttle-6@example.com']);

    $this->actingAs($owner)
        ->postJson("/api/v1/athletes/{$sixth->id}/invite")
        ->assertStatus(429);
});
