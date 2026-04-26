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

it('updates monthly_fee_cents — the academy-wide membership fee in cents (#104)', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id, 'monthly_fee_cents' => null]);
    Sanctum::actingAs($user);

    // Cents (not euros) avoids float pitfalls. €95.00 = 9500 cents.
    $this->patchJson('/api/v1/academy', ['monthly_fee_cents' => 9500])
        ->assertOk()
        ->assertJsonPath('data.monthly_fee_cents', 9500);

    $this->assertDatabaseHas('academies', [
        'user_id' => $user->id,
        'monthly_fee_cents' => 9500,
    ]);
});

it('clears monthly_fee_cents when explicitly set to null', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id, 'monthly_fee_cents' => 9500]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['monthly_fee_cents' => null])
        ->assertOk()
        ->assertJsonPath('data.monthly_fee_cents', null);
});

it('rejects negative monthly_fee_cents with 422', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['monthly_fee_cents' => -1])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['monthly_fee_cents']);
});

it('rejects non-integer monthly_fee_cents (e.g. floats) with 422', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['monthly_fee_cents' => 95.5])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['monthly_fee_cents']);
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

it('ignores slug in the payload — slug is immutable by design', function (): void {
    // Regression guard: if a future contributor adds `slug` to the rules
    // array, this test flips red. The contract is that permalinks survive
    // renames forever — encode it in a test, not just a comment.
    $user = User::factory()->create();
    $academy = Academy::factory()->create([
        'user_id' => $user->id,
        'name' => 'Original Name',
        'slug' => 'original-slug-abcd1234',
    ]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', [
        'name' => 'Renamed Academy',
        'slug' => 'malicious-attacker-slug',
    ])
        ->assertOk()
        ->assertJsonPath('data.name', 'Renamed Academy')
        ->assertJsonPath('data.slug', 'original-slug-abcd1234');

    expect($academy->fresh()->slug)->toBe('original-slug-abcd1234');
});
