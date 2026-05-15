<?php

declare(strict_types=1);

use App\Models\User;

it('returns the authenticated user envelope including email_verified_at', function (): void {
    $user = User::factory()->create([
        'email' => 'mario@example.com',
        'email_verified_at' => now()->subHour(),
    ]);

    $this->actingAs($user)
        ->getJson('/api/v1/auth/me')
        ->assertOk()
        ->assertJsonStructure(['data' => ['id', 'first_name', 'last_name', 'full_name', 'handle', 'email', 'email_verified_at']])
        ->assertJsonPath('data.email', 'mario@example.com');
});

it('returns email_verified_at as null for an unverified user', function (): void {
    $user = User::factory()->unverified()->create();

    $this->actingAs($user)
        ->getJson('/api/v1/auth/me')
        ->assertOk()
        ->assertJsonPath('data.email_verified_at', null);
});

it('rejects /me without a bearer token', function (): void {
    $this->getJson('/api/v1/auth/me')->assertUnauthorized();
});

it('returns JSON 401 (not HTML 500) on /api/* requests without an Accept header (#769)', function (): void {
    // Repro of #769: an unauthenticated request to a Sanctum-protected
    // endpoint that doesn't set `Accept: application/json` used to
    // trigger Laravel's default `unauthenticated()` flow → redirect to
    // the non-existent `login` route → `RouteNotFoundException` → HTML
    // 500 page + `production.ERROR` log line on every probe.
    //
    // After the `shouldRenderJsonWhen` config in `bootstrap/app.php`
    // (matching `api/*`), the same hit returns the canonical JSON 401
    // envelope. `$this->get()` (vs `getJson()`) sends WITHOUT the
    // `Accept: application/json` header — that's the whole point.
    $response = $this->get('/api/v1/auth/me');

    $response->assertUnauthorized();
    $response->assertHeader('content-type', 'application/json');
    $response->assertExactJson(['message' => 'Unauthenticated.']);
});
