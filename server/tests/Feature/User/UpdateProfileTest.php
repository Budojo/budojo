<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('PATCH /me updates the user name and returns the refreshed envelope', function (): void {
    /** @var User $user */
    $user = User::factory()->create(['name' => 'Mario Rossi']);

    $this->actingAs($user)
        ->patchJson('/api/v1/me', ['name' => 'Mario R.'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Mario R.')
        ->assertJsonPath('data.email', $user->email)
        ->assertJsonPath('data.role', 'owner');

    $user->refresh();
    expect($user->name)->toBe('Mario R.');
});

it('PATCH /me rejects an empty name', function (): void {
    $user = User::factory()->create(['name' => 'Mario Rossi']);

    $this->actingAs($user)
        ->patchJson('/api/v1/me', ['name' => ''])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['name']);

    $user->refresh();
    expect($user->name)->toBe('Mario Rossi');
});

it('PATCH /me rejects a name shorter than 2 chars', function (): void {
    $user = User::factory()->create(['name' => 'Mario Rossi']);

    $this->actingAs($user)
        ->patchJson('/api/v1/me', ['name' => 'X'])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['name']);
});

it('PATCH /me rejects a name longer than 255 chars', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->patchJson('/api/v1/me', ['name' => str_repeat('A', 256)])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['name']);
});

it('PATCH /me does not modify email or role', function (): void {
    /** @var User $user */
    $user = User::factory()->create([
        'name' => 'Mario Rossi',
        'email' => 'mario@example.com',
    ]);

    $this->actingAs($user)
        ->patchJson('/api/v1/me', [
            'name' => 'Mario Updated',
            'email' => 'should-be-ignored@example.com',
            'role' => 'athlete',
        ])
        ->assertOk();

    $user->refresh();
    expect($user->name)->toBe('Mario Updated');
    expect($user->email)->toBe('mario@example.com');
    expect($user->role->value)->toBe('owner');
});

it('PATCH /me rejects unauthenticated requests with 401', function (): void {
    $this->patchJson('/api/v1/me', ['name' => 'Anonymous'])
        ->assertStatus(401);
});
