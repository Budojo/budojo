<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Support\Facades\Hash;

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

    $user = User::where('email', 'mario@example.com')->firstOrFail();

    expect($user->password)->not->toBe('Password1!');
    expect(Hash::check('Password1!', $user->password))->toBeTrue();

    $this->assertDatabaseHas('personal_access_tokens', [
        'tokenable_type' => User::class,
        'tokenable_id' => $user->id,
    ]);
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
