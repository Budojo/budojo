<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('PATCH /me updates first_name + last_name and returns the refreshed envelope', function (): void {
    /** @var User $user */
    $user = User::factory()->create([
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
    ]);

    $this->actingAs($user)
        ->patchJson('/api/v1/me', [
            'first_name' => 'Mario',
            'last_name' => 'R.',
        ])
        ->assertOk()
        ->assertJsonPath('data.first_name', 'Mario')
        ->assertJsonPath('data.last_name', 'R.')
        ->assertJsonPath('data.full_name', 'Mario R.')
        ->assertJsonPath('data.email', $user->email)
        ->assertJsonPath('data.role', 'owner');

    $user->refresh();
    expect($user->first_name)->toBe('Mario');
    expect($user->last_name)->toBe('R.');
});

it('PATCH /me persists a valid lowercase handle', function (): void {
    /** @var User $user */
    $user = User::factory()->create();

    $this->actingAs($user)
        ->patchJson('/api/v1/me', [
            'first_name' => 'Mario',
            'last_name' => 'Rossi',
            'handle' => 'matteo.rossi',
        ])
        ->assertOk()
        ->assertJsonPath('data.handle', 'matteo.rossi');

    $user->refresh();
    expect($user->handle)->toBe('matteo.rossi');
});

it('PATCH /me rejects mixed-case handle input (the SPA lowercases as the user types)', function (): void {
    /** @var User $user */
    $user = User::factory()->create();

    $this->actingAs($user)
        ->patchJson('/api/v1/me', [
            'first_name' => 'Mario',
            'last_name' => 'Rossi',
            'handle' => 'MaTteO.RoSsI',
        ])
        ->assertStatus(422)
        ->assertJsonPath('errors.handle.0', 'handle_invalid_format');

    $user->refresh();
    expect($user->handle)->toBeNull();
});

it('PATCH /me clears the handle when null is sent', function (): void {
    /** @var User $user */
    $user = User::factory()->create(['handle' => 'matteo']);

    $this->actingAs($user)
        ->patchJson('/api/v1/me', [
            'first_name' => 'Mario',
            'last_name' => 'Rossi',
            'handle' => null,
        ])
        ->assertOk()
        ->assertJsonPath('data.handle', null);

    $user->refresh();
    expect($user->handle)->toBeNull();
});

it('PATCH /me rejects an empty first_name', function (): void {
    $user = User::factory()->create(['first_name' => 'Mario', 'last_name' => 'Rossi']);

    $this->actingAs($user)
        ->patchJson('/api/v1/me', ['first_name' => '', 'last_name' => 'Rossi'])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['first_name']);

    $user->refresh();
    expect($user->first_name)->toBe('Mario');
});

it('PATCH /me rejects a first_name shorter than 2 chars', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->patchJson('/api/v1/me', ['first_name' => 'X', 'last_name' => 'Rossi'])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['first_name']);
});

it('PATCH /me rejects a first_name longer than 100 chars', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->patchJson('/api/v1/me', [
            'first_name' => str_repeat('A', 101),
            'last_name' => 'Rossi',
        ])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['first_name']);
});

it('PATCH /me rejects an invalid handle (IG-style format violation)', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->patchJson('/api/v1/me', [
            'first_name' => 'Mario',
            'last_name' => 'Rossi',
            'handle' => 'a', // too short
        ])
        ->assertStatus(422)
        ->assertJsonPath('errors.handle.0', 'handle_invalid_format');
});

it('PATCH /me rejects a handle already taken by another user', function (): void {
    $other = User::factory()->create(['handle' => 'matteo']);
    $user = User::factory()->create();

    $this->actingAs($user)
        ->patchJson('/api/v1/me', [
            'first_name' => 'Mario',
            'last_name' => 'Rossi',
            'handle' => 'matteo',
        ])
        ->assertStatus(422)
        ->assertJsonPath('errors.handle.0', 'handle_taken');

    expect($other->fresh()?->handle)->toBe('matteo');
});

it('PATCH /me allows the user to keep their own handle on a no-op edit', function (): void {
    $user = User::factory()->create(['handle' => 'matteo']);

    $this->actingAs($user)
        ->patchJson('/api/v1/me', [
            'first_name' => 'Mario',
            'last_name' => 'Rossi',
            'handle' => 'matteo',
        ])
        ->assertOk()
        ->assertJsonPath('data.handle', 'matteo');
});

it('PATCH /me does not modify email or role', function (): void {
    /** @var User $user */
    $user = User::factory()->create([
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'email' => 'mario@example.com',
    ]);

    $this->actingAs($user)
        ->patchJson('/api/v1/me', [
            'first_name' => 'Mario',
            'last_name' => 'Updated',
            'email' => 'should-be-ignored@example.com',
            'role' => 'athlete',
        ])
        ->assertOk();

    $user->refresh();
    expect($user->last_name)->toBe('Updated');
    expect($user->email)->toBe('mario@example.com');
    expect($user->role->value)->toBe('owner');
});

it('PATCH /me rejects unauthenticated requests with 401', function (): void {
    $this->patchJson('/api/v1/me', [
        'first_name' => 'Anonymous',
        'last_name' => 'User',
    ])->assertStatus(401);
});
