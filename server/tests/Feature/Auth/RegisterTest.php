<?php

declare(strict_types=1);

use App\Models\User;
use App\Services\PwnedPasswordsClient;
use Illuminate\Support\Facades\Hash;

it('registers a new user and returns a token', function (): void {
    $response = $this->postJson('/api/v1/auth/register', [
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
        'terms_accepted' => true,
    ]);

    $response->assertCreated()->assertJsonStructure([
        'data' => ['id', 'first_name', 'last_name', 'full_name', 'handle', 'email'],
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
    // Snap to the start of the current second — `users.terms_accepted_at`
    // is a `timestamp` column (default 0 fractional seconds), so on read-
    // back the microseconds are dropped. Without this floor, a `$before`
    // captured at HH:MM:SS.700 would be considered LATER than a stored
    // value of HH:MM:SS.000 and the >= assertion would flake.
    $before = now()->startOfSecond();

    $this->postJson('/api/v1/auth/register', [
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
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
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
    ])->assertUnprocessable()->assertJsonValidationErrors(['terms_accepted']);

    $this->assertDatabaseMissing('users', ['email' => 'mario@example.com']);
});

it('fails registration when terms_accepted is false (#420)', function (): void {
    $this->postJson('/api/v1/auth/register', [
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
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
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'password_confirmation' => 'Password1!',
        'terms_accepted' => true,
    ])->assertUnprocessable()->assertJsonValidationErrors(['email']);
});

it('fails registration when required fields are missing', function (): void {
    $this->postJson('/api/v1/auth/register', [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['first_name', 'last_name', 'email', 'password', 'terms_accepted']);
});

it('rejects a known-breached password with `password_breached` (HIBP, #415)', function (): void {
    // Swap the test bootstrap's "no breach" stub for a "breach
    // detected" one. The TestCase default keeps every other spec
    // soft-allowed; this one specifically exercises the rejection.
    $this->app->instance(
        PwnedPasswordsClient::class,
        new class () extends PwnedPasswordsClient {
            public function __construct()
            {
            }

            public function isPwned(string $password): bool
            {
                return true;
            }
        },
    );

    $this->postJson('/api/v1/auth/register', [
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'email' => 'mario@example.com',
        'password' => 'qwerty123',
        'password_confirmation' => 'qwerty123',
        'terms_accepted' => true,
    ])
        ->assertUnprocessable()
        ->assertJsonPath('errors.password.0', 'password_breached');

    $this->assertDatabaseMissing('users', ['email' => 'mario@example.com']);
});

it('fails registration when password confirmation does not match', function (): void {
    $this->postJson('/api/v1/auth/register', [
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'email' => 'mario@example.com',
        'password' => 'Password1!',
        'password_confirmation' => 'wrong',
        'terms_accepted' => true,
    ])->assertUnprocessable()->assertJsonValidationErrors(['password']);
});
