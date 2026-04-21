<?php

declare(strict_types=1);

use App\Models\User;

it('registers a new user and returns a token', function (): void {
    $response = $this->postJson('/api/v1/auth/register', [
        'name' => 'Mario Rossi',
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
    ]);

    $response->assertCreated()->assertJsonStructure([
        'data' => ['id', 'name', 'email'],
        'token',
    ]);

    $this->assertDatabaseHas('users', ['email' => 'mario@example.com']);
});

it('fails registration when email is already taken', function (): void {
    User::factory()->create(['email' => 'mario@example.com']);

    $this->postJson('/api/v1/auth/register', [
        'name' => 'Mario Rossi',
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
    ])->assertUnprocessable()->assertJsonValidationErrors(['email']);
});

it('fails registration when required fields are missing', function (): void {
    $this->postJson('/api/v1/auth/register', [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['name', 'email', 'password']);
});

it('fails registration when password confirmation does not match', function (): void {
    $this->postJson('/api/v1/auth/register', [
        'name' => 'Mario Rossi',
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'password_confirmation' => 'wrong',
    ])->assertUnprocessable()->assertJsonValidationErrors(['password']);
});
