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
        'terms_accepted' => true,
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

it('records the terms-of-service acceptance timestamp on the user row (#420)', function (): void {
    $before = now();

    $this->postJson('/api/v1/auth/register', [
        'name' => 'Mario Rossi',
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
        'terms_accepted' => true,
    ])->assertCreated();

    $user = User::where('email', 'mario@example.com')->firstOrFail();

    // The Action stamps the column with `now()` inside the same request;
    // anything older than ~5 seconds means we're not actually persisting
    // it (or the cast is wrong).
    expect($user->terms_accepted_at)->not->toBeNull();
    expect($user->terms_accepted_at->greaterThanOrEqualTo($before))->toBeTrue();
    expect($user->terms_accepted_at->diffInSeconds(now()))->toBeLessThan(5);
});

it('fails registration when terms_accepted is missing (#420)', function (): void {
    $this->postJson('/api/v1/auth/register', [
        'name' => 'Mario Rossi',
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
    ])->assertUnprocessable()->assertJsonValidationErrors(['terms_accepted']);

    $this->assertDatabaseMissing('users', ['email' => 'mario@example.com']);
});

it('fails registration when terms_accepted is false (#420)', function (): void {
    $this->postJson('/api/v1/auth/register', [
        'name' => 'Mario Rossi',
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
        'terms_accepted' => false,
    ])->assertUnprocessable()->assertJsonValidationErrors(['terms_accepted']);

    $this->assertDatabaseMissing('users', ['email' => 'mario@example.com']);
});

it('fails registration when email is already taken', function (): void {
    User::factory()->create(['email' => 'mario@example.com']);

    $this->postJson('/api/v1/auth/register', [
        'name' => 'Mario Rossi',
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
        'terms_accepted' => true,
    ])->assertUnprocessable()->assertJsonValidationErrors(['email']);
});

it('fails registration when required fields are missing', function (): void {
    $this->postJson('/api/v1/auth/register', [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['name', 'email', 'password', 'terms_accepted']);
});

it('fails registration when password confirmation does not match', function (): void {
    $this->postJson('/api/v1/auth/register', [
        'name' => 'Mario Rossi',
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'password_confirmation' => 'wrong',
        'terms_accepted' => true,
    ])->assertUnprocessable()->assertJsonValidationErrors(['password']);
});
