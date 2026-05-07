<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\PendingEmailChange;
use App\Models\User;
use Illuminate\Support\Str;

it('applies the change, marks email_verified_at, prunes the pending row, and returns 200', function (): void {
    /** @var User $user */
    $user = User::factory()->create([
        'email' => 'old@example.com',
        'email_verified_at' => null,
    ]);
    $rawToken = Str::random(64);
    PendingEmailChange::factory()->create([
        'user_id' => $user->id,
        'new_email' => 'new@example.com',
        'token' => PendingEmailChange::hashToken($rawToken),
    ]);

    $this->postJson("/api/v1/email-change/{$rawToken}/verify")
        ->assertOk()
        ->assertJsonPath('message', 'email_change_confirmed');

    $user->refresh();
    expect($user->email)->toBe('new@example.com');
    expect($user->email_verified_at)->not->toBeNull();
    expect(PendingEmailChange::query()->count())->toBe(0);
});

it('responds 410 when the token is unknown (no matching row)', function (): void {
    $bogusToken = Str::random(64);

    $this->postJson("/api/v1/email-change/{$bogusToken}/verify")
        ->assertStatus(410)
        ->assertJsonPath('message', 'invalid_or_expired_link');
});

it('responds 410 when the token has already been consumed (one-shot semantics)', function (): void {
    /** @var User $user */
    $user = User::factory()->create();
    $rawToken = Str::random(64);
    PendingEmailChange::factory()->create([
        'user_id' => $user->id,
        'new_email' => 'new@example.com',
        'token' => PendingEmailChange::hashToken($rawToken),
    ]);

    $this->postJson("/api/v1/email-change/{$rawToken}/verify")->assertOk();

    // Second click on the same link — row is gone.
    $this->postJson("/api/v1/email-change/{$rawToken}/verify")
        ->assertStatus(410)
        ->assertJsonPath('message', 'invalid_or_expired_link');
});

it('responds 410 when the token has expired AND drops the stale row', function (): void {
    /** @var User $user */
    $user = User::factory()->create();
    $rawToken = Str::random(64);
    PendingEmailChange::factory()->expired()->create([
        'user_id' => $user->id,
        'new_email' => 'new@example.com',
        'token' => PendingEmailChange::hashToken($rawToken),
    ]);

    $this->postJson("/api/v1/email-change/{$rawToken}/verify")
        ->assertStatus(410);

    // The stale row is dropped eagerly so a probe can't even discover
    // its existence after expiry — the next click hashes to nothing.
    expect(PendingEmailChange::query()->count())->toBe(0);
});

it('returns 404 from the route constraint on a malformed token (not 64 chars)', function (): void {
    $this->postJson('/api/v1/email-change/short/verify')->assertStatus(404);
    $this->postJson('/api/v1/email-change/' . str_repeat('z', 65) . '/verify')->assertStatus(404);
    // Special chars outside [A-Za-z0-9] — also 404 from the constraint.
    $this->postJson('/api/v1/email-change/' . str_repeat('a', 63) . '!/verify')->assertStatus(404);
});

it('responds 410 and prunes the pending row when the candidate was claimed between request and confirm', function (): void {
    // Race window: between RequestEmailChangeAction (which pre-checks
    // email_taken) and the verify click, another user registered with
    // the same email. The unique index on users.email is the final
    // backstop — we catch the violation, drop the now-unredeemable
    // pending row, and 410.
    /** @var User $user */
    $user = User::factory()->create([
        'email' => 'old@example.com',
    ]);
    $rawToken = Str::random(64);
    PendingEmailChange::factory()->create([
        'user_id' => $user->id,
        'new_email' => 'claimed@example.com',
        'token' => PendingEmailChange::hashToken($rawToken),
    ]);

    // Squatter claims the candidate after the pending row was issued.
    User::factory()->create(['email' => 'claimed@example.com']);

    $this->postJson("/api/v1/email-change/{$rawToken}/verify")
        ->assertStatus(410)
        ->assertJsonPath('message', 'invalid_or_expired_link');

    // The original user's email is unchanged (transaction rolled back).
    $user->refresh();
    expect($user->email)->toBe('old@example.com');

    // The pending row is dropped so the SPA's pending pillola
    // disappears and the user can re-request with a different address.
    expect(PendingEmailChange::query()->where('user_id', $user->id)->count())->toBe(0);
});

it('syncs athletes.email when the user is linked to an athlete row (state-C confirmation)', function (): void {
    // Owner builds a roster row; later that athlete accepted their
    // invite (gets a `users.id`). Now the owner asks to change their
    // email; the pending row lands on the LINKED user, and on confirm
    // BOTH `users.email` and `athletes.email` flip atomically.
    /** @var User $owner */
    $owner = userWithAcademy();
    /** @var User $athleteUser */
    $athleteUser = User::factory()->athlete()->create([
        'email' => 'athlete-old@example.com',
    ]);
    /** @var Athlete $athlete */
    $athlete = Athlete::factory()->for($owner->academy)->create([
        'email' => 'athlete-old@example.com',
        'user_id' => $athleteUser->id,
    ]);

    $rawToken = Str::random(64);
    PendingEmailChange::factory()->create([
        'user_id' => $athleteUser->id,
        'new_email' => 'athlete-new@example.com',
        'token' => PendingEmailChange::hashToken($rawToken),
    ]);

    $this->postJson("/api/v1/email-change/{$rawToken}/verify")->assertOk();

    $athleteUser->refresh();
    $athlete->refresh();
    expect($athleteUser->email)->toBe('athlete-new@example.com');
    expect($athlete->email)->toBe('athlete-new@example.com');
});
