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
        ->assertJsonStructure(['data' => ['id', 'name', 'email', 'email_verified_at']])
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
