<?php

declare(strict_types=1);

use App\Models\PendingDeletion;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

it('logs in an existing user and returns a token', function (): void {
    $user = User::factory()->create(['password' => 'Password1!']);

    $this->postJson('/api/v1/auth/login', [
        'email' => $user->email,
        'password' => 'Password1!',
    ])
        ->assertOk()
        ->assertJsonStructure([
            'data' => ['id', 'name', 'email'],
            'token',
        ]);
});

it('fails login with wrong password', function (): void {
    $user = User::factory()->create();

    $this->postJson('/api/v1/auth/login', [
        'email' => $user->email,
        'password' => 'wrong-password',
    ])->assertUnauthorized();
});

it('fails login with non-existent email', function (): void {
    $this->postJson('/api/v1/auth/login', [
        'email' => 'nobody@example.com',
        'password' => 'Password1!',
    ])->assertUnauthorized();
});

it('fails login when required fields are missing', function (): void {
    $this->postJson('/api/v1/auth/login', [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['email', 'password']);
});

it('populates deletion_pending on the login response when the user is in the grace window (#255)', function (): void {
    // Regression for #255 — Copilot caught that LoginController returned
    // `new UserResource($user)` without eager-loading `pendingDeletion`,
    // so a user already in the grace window saw `deletion_pending: null`
    // on the login response. The SPA bootstrap then had to rely on a
    // follow-up /auth/me call to learn the true state, which is exactly
    // the kind of two-trip dance the field was supposed to prevent.
    $user = User::factory()->create(['password' => 'Password1!']);

    $now = Carbon::now();
    PendingDeletion::query()->create([
        'user_id' => $user->id,
        'requested_at' => $now,
        'scheduled_for' => $now->copy()->addDays(30),
        'confirmation_token' => Str::random(64),
    ]);

    $response = $this->postJson('/api/v1/auth/login', [
        'email' => $user->email,
        'password' => 'Password1!',
    ])->assertOk();

    $response->assertJsonStructure([
        'data' => [
            'id', 'name', 'email',
            'deletion_pending' => ['requested_at', 'scheduled_for'],
        ],
        'token',
    ]);

    expect($response->json('data.deletion_pending'))->not->toBeNull();
});

it('emits null deletion_pending on login when the user has no pending deletion', function (): void {
    // The other half of the regression — a healthy user must still see
    // `deletion_pending: null` on the login response so the SPA never
    // renders a stale grace-window banner.
    $user = User::factory()->create(['password' => 'Password1!']);

    $response = $this->postJson('/api/v1/auth/login', [
        'email' => $user->email,
        'password' => 'Password1!',
    ])->assertOk();

    expect($response->json('data.deletion_pending'))->toBeNull();
});
