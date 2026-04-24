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

// ─── Update (PATCH /api/v1/academy) ──────────────────────────────────────────

it('updates the academy name for the authenticated owner', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create([
        'user_id' => $user->id,
        'name' => 'Old Name',
        'slug' => 'old-name-abc12345',
        'address' => 'Via Vecchia 1',
    ]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['name' => 'New Name'])
        ->assertOk()
        ->assertJsonPath('data.name', 'New Name')
        ->assertJsonPath('data.address', 'Via Vecchia 1')
        // Slug is immutable by design — keeps permalink stable across renames.
        ->assertJsonPath('data.slug', 'old-name-abc12345');

    expect($academy->fresh()->name)->toBe('New Name');
});

it('updates the academy address while preserving the name', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create([
        'user_id' => $user->id,
        'name' => 'Gracie Barra Torino',
        'address' => null,
    ]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['address' => 'Via Roma 10, Torino'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Gracie Barra Torino')
        ->assertJsonPath('data.address', 'Via Roma 10, Torino');

    expect($academy->fresh()->address)->toBe('Via Roma 10, Torino');
});

it('clears the academy address when explicitly set to null', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create([
        'user_id' => $user->id,
        'address' => 'Via da cancellare 5',
    ]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['address' => null])
        ->assertOk()
        ->assertJsonPath('data.address', null);

    expect($academy->fresh()->address)->toBeNull();
});

it('returns 403 with "Forbidden." body when the user has no academy', function (): void {
    // The canon ownership contract: no academy = not authorized to update anything.
    // Matches the DocumentController / UpdateDocumentRequest wire-level contract.
    Sanctum::actingAs(User::factory()->create());

    $this->patchJson('/api/v1/academy', ['name' => 'Ghost Academy'])
        ->assertForbidden()
        ->assertExactJson(['message' => 'Forbidden.']);
});

it('returns 401 when updating academy without auth', function (): void {
    $this->patchJson('/api/v1/academy', ['name' => 'Anon Academy'])
        ->assertUnauthorized();
});

it('returns 422 when name is provided but empty', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['name' => ''])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['name']);
});

it('returns 422 when address exceeds 500 characters', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['address' => str_repeat('a', 501)])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['address']);
});

it('returns 422 when name exceeds 255 characters', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['name' => str_repeat('x', 256)])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['name']);
});
