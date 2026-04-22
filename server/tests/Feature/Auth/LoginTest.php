<?php

declare(strict_types=1);

use App\Models\User;

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
