<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Support\Facades\RateLimiter;

beforeEach(function (): void {
    // Throttle limiters carry state across PEST tests in the same process.
    // Laravel's `throttle:5,1` middleware derives its limiter key from the
    // route signature plus the client IP; clearing the catch-all key it
    // uses for the unnamed throttle is enough to isolate tests in this
    // file (mirrors the pattern in PasswordResetTest::beforeEach()).
    RateLimiter::clear('throttle:5,1');
});

afterEach(function (): void {
    // This file deliberately exhausts the limiter; without an afterEach
    // the next test file calling /auth/login (LoginTest, PasswordResetTest)
    // would inherit a saturated counter and flake on the first request.
    RateLimiter::clear('throttle:5,1');
});

// =====================================================================
// POST /api/v1/auth/login - rate limiting (#414)
// =====================================================================

it('throttles /auth/login to 5 attempts per minute per IP (failed credentials)', function (): void {
    // The login endpoint MUST be rate-limited. Without this the password
    // field is brute-forceable at network speed against a known email,
    // since the controller responds 401 in O(ms). With `throttle:5,1`
    // the 6th attempt within a minute returns 429 and the standard
    // Retry-After header.
    User::factory()->create([
        'email' => 'mario@example.com',
        'password' => 'CorrectPassword1!',
    ]);

    foreach (range(1, 5) as $_) {
        $this->postJson('/api/v1/auth/login', [
            'email' => 'mario@example.com',
            'password' => 'wrong-password',
        ])->assertUnauthorized();
    }

    $response = $this->postJson('/api/v1/auth/login', [
        'email' => 'mario@example.com',
        'password' => 'wrong-password',
    ])->assertStatus(429);

    // Laravel's throttle middleware always emits Retry-After on 429 so
    // a well-behaved client (incl. the SPA) can render a countdown
    // instead of hammering the endpoint.
    expect($response->headers->has('Retry-After'))->toBeTrue();
});

it('throttles /auth/login regardless of credential validity (mixed valid + invalid attempts)', function (): void {
    // The limiter is keyed on the request signature, NOT on the response
    // status - successful logins still count toward the cap. This matches
    // Laravel's default throttle middleware semantics and prevents a
    // crafted attack that interleaves a valid attempt to reset a per-key
    // counter (which the default IP-keyed limiter does not implement).
    $user = User::factory()->create([
        'email' => 'mario@example.com',
        'password' => 'CorrectPassword1!',
    ]);

    // 5 successful logins are allowed.
    foreach (range(1, 5) as $_) {
        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'CorrectPassword1!',
        ])->assertOk();
    }

    // 6th: throttled.
    $this->postJson('/api/v1/auth/login', [
        'email' => $user->email,
        'password' => 'CorrectPassword1!',
    ])->assertStatus(429);
});

it('does not throttle a successful login below the cap', function (): void {
    // Sanity check - the throttle must not break the happy path. A user
    // with correct credentials should authenticate normally on every
    // attempt under the limit.
    $user = User::factory()->create([
        'email' => 'mario@example.com',
        'password' => 'CorrectPassword1!',
    ]);

    $this->postJson('/api/v1/auth/login', [
        'email' => $user->email,
        'password' => 'CorrectPassword1!',
    ])
        ->assertOk()
        ->assertJsonStructure([
            'data' => ['id', 'name', 'email'],
            'token',
        ]);
});
