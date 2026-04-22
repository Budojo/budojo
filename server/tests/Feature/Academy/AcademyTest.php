<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

it('creates an academy for an authenticated user', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $this->postJson('/api/v1/academy', [
        'name' => 'Gracie Barra Roma',
        'address' => 'Via Roma 1, Roma',
    ])
        ->assertCreated()
        ->assertJsonStructure([
            'data' => ['id', 'name', 'slug', 'address'],
        ]);

    $this->assertDatabaseHas('academies', [
        'user_id' => $user->id,
        'name' => 'Gracie Barra Roma',
    ]);
});

it('returns 409 when user already has an academy', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->postJson('/api/v1/academy', ['name' => 'Another Academy'])
        ->assertConflict();
});

it('returns 422 when name is missing', function (): void {
    Sanctum::actingAs(User::factory()->create());

    $this->postJson('/api/v1/academy', [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['name']);
});

it('returns 401 when creating academy without auth', function (): void {
    $this->postJson('/api/v1/academy', ['name' => 'Test Academy'])
        ->assertUnauthorized();
});

it('returns the academy for an authenticated user', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create([
        'user_id' => $user->id,
        'name' => 'Checkmat Milano',
        'address' => 'Via Milano 5',
    ]);
    Sanctum::actingAs($user);

    $this->getJson('/api/v1/academy')
        ->assertOk()
        ->assertJsonPath('data.id', $academy->id)
        ->assertJsonPath('data.name', 'Checkmat Milano');
});

it('returns 404 when user has no academy yet', function (): void {
    Sanctum::actingAs(User::factory()->create());

    $this->getJson('/api/v1/academy')
        ->assertNotFound();
});

it('returns 401 when fetching academy without auth', function (): void {
    $this->getJson('/api/v1/academy')
        ->assertUnauthorized();
});
