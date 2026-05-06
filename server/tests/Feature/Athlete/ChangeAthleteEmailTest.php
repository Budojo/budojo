<?php

declare(strict_types=1);

use App\Mail\AthleteInvitationMail;
use App\Mail\EmailChangeNotificationMail;
use App\Mail\EmailChangeVerificationMail;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthleteInvitation;
use App\Models\PendingEmailChange;
use App\Models\User;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;

beforeEach(function (): void {
    Mail::fake();
});

afterEach(function (): void {
    RateLimiter::clear('email-change-request');
});

it('state A: no invitation, no user_id — direct PATCH on athletes.email, no mail', function (): void {
    /** @var User $owner */
    $owner = userWithAcademy();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($owner->academy)->create([
        'email' => 'old@example.com',
        'user_id' => null,
    ]);

    $this->actingAs($owner)
        ->postJson("/api/v1/athletes/{$athlete->id}/email", ['email' => 'fresh@example.com'])
        ->assertOk()
        ->assertJsonPath('data.mode', 'direct');

    $athlete->refresh();
    expect($athlete->email)->toBe('fresh@example.com');
    Mail::assertNothingQueued();
});

it('state B: pending invitation — old invite revoked, athletes.email swapped, fresh invite queued', function (): void {
    /** @var User $owner */
    $owner = userWithAcademy();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($owner->academy)->create([
        'email' => 'old@example.com',
        'user_id' => null,
    ]);
    /** @var AthleteInvitation $original */
    $original = AthleteInvitation::factory()->create([
        'athlete_id' => $athlete->id,
        'academy_id' => $athlete->academy_id,
        'sent_by_user_id' => $owner->id,
        'email' => 'old@example.com',
    ]);

    $this->actingAs($owner)
        ->postJson("/api/v1/athletes/{$athlete->id}/email", ['email' => 'fresh@example.com'])
        ->assertOk()
        ->assertJsonPath('data.mode', 'invite_swap');

    $athlete->refresh();
    expect($athlete->email)->toBe('fresh@example.com');

    $original->refresh();
    expect($original->isRevoked())->toBeTrue();

    // A fresh pending invite landed for the new address.
    $fresh = AthleteInvitation::query()
        ->where('athlete_id', $athlete->id)
        ->where('email', 'fresh@example.com')
        ->whereNull('revoked_at')
        ->whereNull('accepted_at')
        ->first();
    expect($fresh)->not->toBeNull();

    Mail::assertQueued(AthleteInvitationMail::class, fn (AthleteInvitationMail $mail): bool => $mail->hasTo('fresh@example.com'));
});

it('state C: linked user — pending row created, athletes.email NOT mutated, both mails queued', function (): void {
    /** @var User $owner */
    $owner = userWithAcademy();
    /** @var User $athleteUser */
    $athleteUser = User::factory()->athlete()->create([
        'email' => 'old@example.com',
    ]);
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($owner->academy)->create([
        'email' => 'old@example.com',
        'user_id' => $athleteUser->id,
    ]);

    $this->actingAs($owner)
        ->postJson("/api/v1/athletes/{$athlete->id}/email", ['email' => 'new@example.com'])
        ->assertOk()
        ->assertJsonPath('data.mode', 'pending');

    // Pending row sits on the LINKED user.
    $pending = PendingEmailChange::query()
        ->where('user_id', $athleteUser->id)
        ->where('new_email', 'new@example.com')
        ->first();
    expect($pending)->not->toBeNull();

    // Crucially: athletes.email is UNCHANGED until confirm — sync
    // happens inside `ConfirmEmailChangeAction` on the click.
    $athlete->refresh();
    expect($athlete->email)->toBe('old@example.com');
    $athleteUser->refresh();
    expect($athleteUser->email)->toBe('old@example.com');

    Mail::assertQueued(EmailChangeVerificationMail::class);
    Mail::assertQueued(EmailChangeNotificationMail::class);
});

it('rejects with 403 when the caller is not the academy owner', function (): void {
    /** @var User $owner */
    $owner = userWithAcademy();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($owner->academy)->create();

    /** @var User $intruder */
    $intruder = User::factory()->create();
    Academy::factory()->for($intruder, 'owner')->create();

    $this->actingAs($intruder)
        ->postJson("/api/v1/athletes/{$athlete->id}/email", ['email' => 'never@example.com'])
        ->assertStatus(403);
});

it('rejects with 403 when the caller has role:athlete', function (): void {
    /** @var User $owner */
    $owner = userWithAcademy();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($owner->academy)->create();

    /** @var User $athleteUser */
    $athleteUser = User::factory()->athlete()->create();

    $this->actingAs($athleteUser)
        ->postJson("/api/v1/athletes/{$athlete->id}/email", ['email' => 'never@example.com'])
        ->assertStatus(403);
});

it('rejects with 401 when unauthenticated', function (): void {
    /** @var User $owner */
    $owner = userWithAcademy();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($owner->academy)->create();

    $this->postJson("/api/v1/athletes/{$athlete->id}/email", ['email' => 'never@example.com'])
        ->assertStatus(401);
});
