<?php

declare(strict_types=1);

use App\Enums\UserRole;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthleteInvitation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    RateLimiter::clear('throttle:5,1');
    RateLimiter::clear('throttle:30,1');
});

afterEach(function (): void {
    RateLimiter::clear('throttle:5,1');
    RateLimiter::clear('throttle:30,1');
});

/**
 * Build the (raw, hash) pair plus a fresh pending invitation row
 * pointing at a coherent owner / academy / athlete chain.
 *
 * @return array{0: string, 1: AthleteInvitation, 2: Athlete, 3: User}
 */
function pendingInvitation(string $email = 'newathlete@example.com'): array
{
    $owner = User::factory()->create();
    /** @var Academy $academy */
    $academy = Academy::factory()->for($owner, 'owner')->create();
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($academy)->create([
        'email' => $email,
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
    ]);

    $rawToken = Str::random(64);
    $hash = AthleteInvitation::hashToken($rawToken);

    /** @var AthleteInvitation $invitation */
    $invitation = AthleteInvitation::factory()
        ->for($athlete)
        ->state([
            'academy_id' => $academy->id,
            'sent_by_user_id' => $owner->id,
            'email' => $email,
            'token' => $hash,
        ])
        ->create();

    return [$rawToken, $invitation, $athlete, $owner];
}

it('GET preview returns the athlete + academy snapshot for a pending token', function (): void {
    [$rawToken, , $athlete] = pendingInvitation();

    $this->getJson("/api/v1/athlete-invite/{$rawToken}/preview")
        ->assertOk()
        ->assertJsonPath('data.first_name', 'Mario')
        ->assertJsonPath('data.last_name', 'Rossi')
        ->assertJsonPath('data.email', 'newathlete@example.com')
        ->assertJsonStructure(['data' => ['first_name', 'last_name', 'email', 'academy_name', 'expires_at']]);
});

it('GET preview returns 404 for unknown token', function (): void {
    $unknownToken = Str::random(64);

    $this->getJson("/api/v1/athlete-invite/{$unknownToken}/preview")
        ->assertStatus(404);
});

it('GET preview returns 404 for accepted invite', function (): void {
    [$rawToken, $invitation] = pendingInvitation();
    $invitation->forceFill(['accepted_at' => now()])->save();

    $this->getJson("/api/v1/athlete-invite/{$rawToken}/preview")
        ->assertStatus(404);
});

it('GET preview returns 404 for revoked invite', function (): void {
    [$rawToken, $invitation] = pendingInvitation();
    $invitation->forceFill(['revoked_at' => now()])->save();

    $this->getJson("/api/v1/athlete-invite/{$rawToken}/preview")
        ->assertStatus(404);
});

it('GET preview returns 404 for expired invite', function (): void {
    [$rawToken, $invitation] = pendingInvitation();
    $invitation->forceFill(['expires_at' => now()->subDay()])->save();

    $this->getJson("/api/v1/athlete-invite/{$rawToken}/preview")
        ->assertStatus(404);
});

it('POST accept creates an athlete user, links the row, returns a Sanctum token', function (): void {
    [$rawToken, $invitation, $athlete] = pendingInvitation();

    $this->postJson("/api/v1/athlete-invite/{$rawToken}/accept", [
        'password' => 'a-strong-password',
        'password_confirmation' => 'a-strong-password',
        'accept_privacy' => true,
        'accept_terms' => true,
    ])
        ->assertCreated()
        ->assertJsonStructure(['data' => ['token', 'user' => ['id', 'name', 'email', 'role']]])
        ->assertJsonPath('data.user.email', 'newathlete@example.com')
        ->assertJsonPath('data.user.role', 'athlete');

    /** @var User $user */
    $user = User::query()->where('email', 'newathlete@example.com')->first();
    expect($user)->not->toBeNull();
    expect($user->role)->toBe(UserRole::Athlete);
    expect($user->email_verified_at)->not->toBeNull();
    expect($user->terms_accepted_at)->not->toBeNull();
    expect(Hash::check('a-strong-password', $user->password))->toBeTrue();

    $athlete->refresh();
    expect($athlete->user_id)->toBe($user->id);

    $invitation->refresh();
    expect($invitation->isAccepted())->toBeTrue();
});

it('POST accept rejects with 422 when password too short', function (): void {
    [$rawToken] = pendingInvitation();

    $this->postJson("/api/v1/athlete-invite/{$rawToken}/accept", [
        'password' => 'short',
        'password_confirmation' => 'short',
        'accept_privacy' => true,
        'accept_terms' => true,
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['password']);
});

it('POST accept rejects with 422 when passwords do not match', function (): void {
    [$rawToken] = pendingInvitation();

    $this->postJson("/api/v1/athlete-invite/{$rawToken}/accept", [
        'password' => 'a-strong-password',
        'password_confirmation' => 'different-password',
        'accept_privacy' => true,
        'accept_terms' => true,
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['password']);
});

it('POST accept rejects with 422 when privacy + terms are not accepted', function (): void {
    [$rawToken] = pendingInvitation();

    $this->postJson("/api/v1/athlete-invite/{$rawToken}/accept", [
        'password' => 'a-strong-password',
        'password_confirmation' => 'a-strong-password',
        'accept_privacy' => false,
        'accept_terms' => false,
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['accept_privacy', 'accept_terms']);
});

it('POST accept rejects with 422 + invite_invalid for an unknown token', function (): void {
    $unknownToken = Str::random(64);

    $this->postJson("/api/v1/athlete-invite/{$unknownToken}/accept", [
        'password' => 'a-strong-password',
        'password_confirmation' => 'a-strong-password',
        'accept_privacy' => true,
        'accept_terms' => true,
    ])
        ->assertStatus(422)
        ->assertJsonPath('errors.token.0', 'invite_invalid');
});

it('POST accept rejects with 422 + invite_already_accepted for an accepted token', function (): void {
    [$rawToken, $invitation] = pendingInvitation();
    $invitation->forceFill(['accepted_at' => now()])->save();

    $this->postJson("/api/v1/athlete-invite/{$rawToken}/accept", [
        'password' => 'a-strong-password',
        'password_confirmation' => 'a-strong-password',
        'accept_privacy' => true,
        'accept_terms' => true,
    ])
        ->assertStatus(422)
        ->assertJsonPath('errors.token.0', 'invite_already_accepted');
});

it('POST accept rejects with 422 + invite_revoked for a revoked token', function (): void {
    [$rawToken, $invitation] = pendingInvitation();
    $invitation->forceFill(['revoked_at' => now()])->save();

    $this->postJson("/api/v1/athlete-invite/{$rawToken}/accept", [
        'password' => 'a-strong-password',
        'password_confirmation' => 'a-strong-password',
        'accept_privacy' => true,
        'accept_terms' => true,
    ])
        ->assertStatus(422)
        ->assertJsonPath('errors.token.0', 'invite_revoked');
});

it('POST accept rejects with 422 + invite_expired for an expired token', function (): void {
    [$rawToken, $invitation] = pendingInvitation();
    $invitation->forceFill(['expires_at' => now()->subDay()])->save();

    $this->postJson("/api/v1/athlete-invite/{$rawToken}/accept", [
        'password' => 'a-strong-password',
        'password_confirmation' => 'a-strong-password',
        'accept_privacy' => true,
        'accept_terms' => true,
    ])
        ->assertStatus(422)
        ->assertJsonPath('errors.token.0', 'invite_expired');
});

it('POST accept guards the email-already-registered race window', function (): void {
    [$rawToken] = pendingInvitation('squatted@example.com');

    // Simulate someone registering with the same email AFTER the
    // invite went out but BEFORE the athlete clicks accept. PR-B's
    // anti-squatting check fires at invite-send; this is the
    // accept-side mirror.
    User::factory()->create(['email' => 'squatted@example.com']);

    $this->postJson("/api/v1/athlete-invite/{$rawToken}/accept", [
        'password' => 'a-strong-password',
        'password_confirmation' => 'a-strong-password',
        'accept_privacy' => true,
        'accept_terms' => true,
    ])
        ->assertStatus(422)
        ->assertJsonPath('errors.email.0', 'email_already_registered');
});

it('POST accept rejects malformed token at the routing layer (404)', function (): void {
    // Constraint pattern is [A-Za-z0-9]{64}; a 32-char string fails
    // before the controller is reached.
    $shortToken = Str::random(32);

    $this->postJson("/api/v1/athlete-invite/{$shortToken}/accept", [
        'password' => 'a-strong-password',
        'password_confirmation' => 'a-strong-password',
        'accept_privacy' => true,
        'accept_terms' => true,
    ])->assertStatus(404);
});
