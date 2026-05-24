<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

/**
 * Pins the bcrypt-DoS cap (#1013) on every FormRequest that hashes
 * a password. Without these tests a future contributor could lift
 * `max:255` to `max:1000` (or drop it entirely) and the only line
 * of defence — the WHY comment — would fall silently.
 *
 * Strategy: POST `str_repeat('a', 256)` and assert 422 with a
 * `password` validation error key. Each test exercises ONE
 * FormRequest end-to-end through its real route so a future move
 * of the validation rules to a base class / trait keeps the
 * contract pinned at the HTTP boundary.
 */
beforeEach(function (): void {
    RateLimiter::clear('throttle:5,1');
    RateLimiter::clear('throttle:10,1');
});

afterEach(function (): void {
    RateLimiter::clear('throttle:5,1');
    RateLimiter::clear('throttle:10,1');
});

it('LoginRequest rejects password > 255 chars (bcrypt-DoS cap #1013)', function (): void {
    $this->postJson('/api/v1/auth/login', [
        'email' => 'someone@example.com',
        'password' => str_repeat('a', 256),
    ])->assertStatus(422)->assertJsonValidationErrors(['password']);
});

it('RegisterRequest rejects password > 255 chars (#1013)', function (): void {
    $this->postJson('/api/v1/auth/register', [
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'email' => 'newuser@example.com',
        'password' => str_repeat('a', 256),
        'password_confirmation' => str_repeat('a', 256),
        'terms_accepted' => true,
    ])->assertStatus(422)->assertJsonValidationErrors(['password']);
});

it('ResetPasswordRequest rejects password > 255 chars (#1013)', function (): void {
    $user = User::factory()->create(['email' => 'reset@example.com']);
    $token = Password::createToken($user);

    $this->postJson('/api/v1/auth/reset-password', [
        'email' => 'reset@example.com',
        'token' => $token,
        'password' => str_repeat('a', 256),
        'password_confirmation' => str_repeat('a', 256),
    ])->assertStatus(422)->assertJsonValidationErrors(['password']);
});

it('ChangePasswordRequest rejects current_password > 255 chars (#1013)', function (): void {
    $user = User::factory()->create(['password' => Hash::make('correct-horse')]);

    $this->actingAs($user)->postJson('/api/v1/me/password', [
        'current_password' => str_repeat('a', 256),
        'password' => 'NewValidPass1!',
        'password_confirmation' => 'NewValidPass1!',
    ])->assertStatus(422)->assertJsonValidationErrors(['current_password']);
});

it('ChangePasswordRequest rejects new password > 255 chars (#1013)', function (): void {
    $user = User::factory()->create(['password' => Hash::make('correct-horse')]);

    $this->actingAs($user)->postJson('/api/v1/me/password', [
        'current_password' => 'correct-horse',
        'password' => str_repeat('a', 256),
        'password_confirmation' => str_repeat('a', 256),
    ])->assertStatus(422)->assertJsonValidationErrors(['password']);
});

it('AcceptAthleteInvitationRequest rejects password > 255 chars (#1013)', function (): void {
    // The FormRequest's `max:255` fires before the controller (or
    // any token-existence middleware — there is none on the route),
    // so we don't need a real invitation row OR athlete-shape fields
    // in the body: the 422 lands purely on the validation surface.
    $rawToken = Str::random(64);

    $this->postJson("/api/v1/athlete-invite/{$rawToken}/accept", [
        'password' => str_repeat('a', 256),
        'password_confirmation' => str_repeat('a', 256),
    ])->assertStatus(422)->assertJsonValidationErrors(['password']);
});

it('DisableTwoFactorRequest rejects password > 255 chars (#1013)', function (): void {
    $user = User::factory()->create(['password' => Hash::make('correct-horse')]);

    $this->actingAs($user)->deleteJson('/api/v1/me/two-factor', [
        'password' => str_repeat('a', 256),
    ])->assertStatus(422)->assertJsonValidationErrors(['password']);
});

it('RequestAccountDeletionRequest rejects password > 255 chars (#1013)', function (): void {
    $user = User::factory()->create(['password' => Hash::make('correct-horse')]);

    $this->actingAs($user)->postJson('/api/v1/me/deletion-request', [
        'password' => str_repeat('a', 256),
    ])->assertStatus(422)->assertJsonValidationErrors(['password']);
});
