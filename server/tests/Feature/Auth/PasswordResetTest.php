<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;

beforeEach(function (): void {
    // Throttle limiters carry state across PEST tests in the same process.
    // Reset both the password-reset-request limiter and the catch-all
    // throttle:6,1 fallback so tests don't bleed into each other.
    RateLimiter::clear('password-reset-request');
    RateLimiter::clear('throttle:6,1');
});

// =====================================================================
// POST /api/v1/auth/forgot-password
// =====================================================================

it('queues a password reset email when an existing user requests one', function (): void {
    Notification::fake();

    $user = User::factory()->create(['email' => 'mario@example.com']);

    $this->postJson('/api/v1/auth/forgot-password', ['email' => 'mario@example.com'])
        ->assertAccepted();

    Notification::assertSentTo($user, ResetPassword::class);
});

it('builds the reset URL with the SPA path AND the user email in the query string (regression)', function (): void {
    // Eloquent attributes are accessed via __get magic, so the closure
    // wired in AppServiceProvider must use the CanResetPassword contract
    // (not property_exists) to find the email. Without this regression
    // test we shipped a link with no email param at all — which the SPA
    // treats as an invalid link.
    $user = User::factory()->create(['email' => 'mario@example.com']);
    $token = Password::createToken($user);

    $url = new ResetPassword($token)->toMail($user)->actionUrl;

    expect($url)->toContain('/auth/reset-password')
        ->and($url)->toContain('token=' . urlencode($token))
        ->and($url)->toContain('email=' . urlencode('mario@example.com'));
});

it('returns 202 without queueing a notification when the email is unknown (no enumeration leak)', function (): void {
    // Endpoint must reply identically for known + unknown emails so an
    // attacker can't probe for registered accounts. The PRD calls this
    // out as a defensive must-have.
    Notification::fake();

    $this->postJson('/api/v1/auth/forgot-password', ['email' => 'ghost@example.com'])
        ->assertAccepted();

    Notification::assertNothingSent();
});

it('rejects forgot-password with no email', function (): void {
    $this->postJson('/api/v1/auth/forgot-password', [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('email');
});

it('rejects forgot-password with a malformed email', function (): void {
    $this->postJson('/api/v1/auth/forgot-password', ['email' => 'not-an-email'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('email');
});

it('throttles forgot-password to 6 requests per minute per IP', function (): void {
    Notification::fake();

    User::factory()->create(['email' => 'mario@example.com']);

    // First 6 requests are accepted.
    foreach (range(1, 6) as $_) {
        $this->postJson('/api/v1/auth/forgot-password', ['email' => 'mario@example.com'])
            ->assertAccepted();
    }

    // The 7th hits the limiter.
    $this->postJson('/api/v1/auth/forgot-password', ['email' => 'mario@example.com'])
        ->assertStatus(429);
});

// =====================================================================
// POST /api/v1/auth/reset-password
// =====================================================================

it('resets the password with a valid token and lets the user log in with the new one', function (): void {
    $user = User::factory()->create([
        'email' => 'mario@example.com',
        'password' => Hash::make('OldPassword1!'),
    ]);

    // Generate a real token via Laravel's Password broker — this is the
    // same path the email contains, so we exercise the production flow
    // end-to-end (vs. fabricating a token by hand).
    $token = Password::createToken($user);

    $this->postJson('/api/v1/auth/reset-password', [
        'email' => 'mario@example.com',
        'token' => $token,
        'password' => 'NewPassword1!',
        'password_confirmation' => 'NewPassword1!',
    ])->assertOk();

    $user->refresh();
    expect(Hash::check('NewPassword1!', $user->password))->toBeTrue();

    // Smoke-test the new credentials work end-to-end via the login route.
    $this->postJson('/api/v1/auth/login', [
        'email' => 'mario@example.com',
        'password' => 'NewPassword1!',
    ])->assertOk()->assertJsonPath('data.email', 'mario@example.com');
});

it('rejects reset-password with a tampered token', function (): void {
    $user = User::factory()->create([
        'email' => 'mario@example.com',
        'password' => Hash::make('OldPassword1!'),
    ]);

    $this->postJson('/api/v1/auth/reset-password', [
        'email' => 'mario@example.com',
        'token' => 'definitely-not-a-real-token',
        'password' => 'NewPassword1!',
        'password_confirmation' => 'NewPassword1!',
    ])->assertUnprocessable();

    $user->refresh();
    expect(Hash::check('OldPassword1!', $user->password))->toBeTrue();
});

it('rejects reset-password with mismatched password confirmation', function (): void {
    $user = User::factory()->create(['email' => 'mario@example.com']);
    $token = Password::createToken($user);

    $this->postJson('/api/v1/auth/reset-password', [
        'email' => 'mario@example.com',
        'token' => $token,
        'password' => 'NewPassword1!',
        'password_confirmation' => 'DifferentPassword!',
    ])->assertUnprocessable()
        ->assertJsonValidationErrors('password');
});

it('rejects reset-password with an unknown email', function (): void {
    $this->postJson('/api/v1/auth/reset-password', [
        'email' => 'ghost@example.com',
        'token' => 'any-token',
        'password' => 'NewPassword1!',
        'password_confirmation' => 'NewPassword1!',
    ])->assertUnprocessable();
});

it('rejects reset-password with a too-short password (uses register policy: min 8 chars)', function (): void {
    $user = User::factory()->create(['email' => 'mario@example.com']);
    $token = Password::createToken($user);

    $this->postJson('/api/v1/auth/reset-password', [
        'email' => 'mario@example.com',
        'token' => $token,
        'password' => 'short',
        'password_confirmation' => 'short',
    ])->assertUnprocessable()
        ->assertJsonValidationErrors('password');
});

it('invalidates the token after a successful reset (one-time use)', function (): void {
    $user = User::factory()->create(['email' => 'mario@example.com']);
    $token = Password::createToken($user);

    $this->postJson('/api/v1/auth/reset-password', [
        'email' => 'mario@example.com',
        'token' => $token,
        'password' => 'NewPassword1!',
        'password_confirmation' => 'NewPassword1!',
    ])->assertOk();

    // Same token reused — Laravel's Password broker deletes the row on
    // success; replays must fail. Defends against an attacker who later
    // intercepts the original email link.
    $this->postJson('/api/v1/auth/reset-password', [
        'email' => 'mario@example.com',
        'token' => $token,
        'password' => 'AnotherNewPassword1!',
        'password_confirmation' => 'AnotherNewPassword1!',
    ])->assertUnprocessable();
});
