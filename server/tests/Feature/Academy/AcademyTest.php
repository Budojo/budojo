<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Address;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

/**
 * Default-valid structured address payload (#72) for tests that need an
 * address but don't care about the specific values. Override individual
 * keys via `array_merge` for the negative cases.
 *
 * @return array<string, mixed>
 */
function validAddressPayload(array $overrides = []): array
{
    return array_merge([
        'line1' => 'Via Roma 1',
        'line2' => null,
        'city' => 'Roma',
        'postal_code' => '00100',
        'province' => 'RM',
        'country' => 'IT',
    ], $overrides);
}

it('creates an academy for an authenticated user', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $this->postJson('/api/v1/academy', [
        'name' => 'Gracie Barra Roma',
        'address' => validAddressPayload(),
    ])
        ->assertCreated()
        ->assertJsonStructure([
            'data' => [
                'id',
                'name',
                'slug',
                'address' => ['line1', 'line2', 'city', 'postal_code', 'province', 'country'],
            ],
        ])
        ->assertJsonPath('data.address.line1', 'Via Roma 1')
        ->assertJsonPath('data.address.province', 'RM')
        ->assertJsonPath('data.address.country', 'IT');

    $this->assertDatabaseHas('academies', [
        'user_id' => $user->id,
        'name' => 'Gracie Barra Roma',
    ]);
});

it('creates an academy without an address (address is optional)', function (): void {
    $user = User::factory()->create();
    Sanctum::actingAs($user);

    $this->postJson('/api/v1/academy', ['name' => 'Address-less Academy'])
        ->assertCreated()
        ->assertJsonPath('data.address', null);
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
    ]);
    Address::factory()->create([
        'addressable_type' => Academy::class,
        'addressable_id' => $academy->id,
        'line1' => 'Via Milano 5',
        'city' => 'Milano',
        'postal_code' => '20100',
        'province' => 'MI',
        'country' => 'IT',
    ]);
    Sanctum::actingAs($user);

    $this->getJson('/api/v1/academy')
        ->assertOk()
        ->assertJsonPath('data.id', $academy->id)
        ->assertJsonPath('data.name', 'Checkmat Milano')
        ->assertJsonPath('data.address.line1', 'Via Milano 5')
        ->assertJsonPath('data.address.province', 'MI');
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
    ]);
    Address::factory()->create([
        'addressable_type' => Academy::class,
        'addressable_id' => $academy->id,
        'line1' => 'Via Vecchia 1',
    ]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['name' => 'New Name'])
        ->assertOk()
        ->assertJsonPath('data.name', 'New Name')
        // Address survives an unrelated PATCH that omits the `address` key.
        ->assertJsonPath('data.address.line1', 'Via Vecchia 1')
        // Slug is immutable by design — keeps permalink stable across renames.
        ->assertJsonPath('data.slug', 'old-name-abc12345');

    expect($academy->fresh()->name)->toBe('New Name');
});

it('upserts an academy address via PATCH when the academy has none', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create([
        'user_id' => $user->id,
        'name' => 'Gracie Barra Torino',
    ]);
    Sanctum::actingAs($user);

    $payload = validAddressPayload(['line1' => 'Via Roma 10', 'city' => 'Torino', 'province' => 'TO', 'postal_code' => '10100']);
    $this->patchJson('/api/v1/academy', ['address' => $payload])
        ->assertOk()
        ->assertJsonPath('data.name', 'Gracie Barra Torino')
        ->assertJsonPath('data.address.line1', 'Via Roma 10')
        ->assertJsonPath('data.address.city', 'Torino')
        ->assertJsonPath('data.address.province', 'TO');

    expect($academy->fresh()->address)->not->toBeNull();
    expect($academy->fresh()->address?->city)->toBe('Torino');
});

it('replaces an existing address via PATCH (idempotent upsert)', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create(['user_id' => $user->id]);
    Address::factory()->create([
        'addressable_type' => Academy::class,
        'addressable_id' => $academy->id,
        'line1' => 'Via Vecchia 1',
        'city' => 'Roma',
        'province' => 'RM',
        'postal_code' => '00100',
        'country' => 'IT',
    ]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', [
        'address' => validAddressPayload(['line1' => 'Via Nuova 99', 'city' => 'Milano', 'province' => 'MI', 'postal_code' => '20100']),
    ])
        ->assertOk()
        ->assertJsonPath('data.address.line1', 'Via Nuova 99')
        ->assertJsonPath('data.address.city', 'Milano');

    // morphOne keeps the row count at 1 — the existing row was replaced
    // in place, not duplicated.
    expect(Address::where('addressable_type', Academy::class)
        ->where('addressable_id', $academy->id)
        ->count())->toBe(1);
});

it('clears the academy address when explicitly set to null', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create(['user_id' => $user->id]);
    Address::factory()->create([
        'addressable_type' => Academy::class,
        'addressable_id' => $academy->id,
        'line1' => 'Via da cancellare 5',
    ]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['address' => null])
        ->assertOk()
        ->assertJsonPath('data.address', null);

    expect($academy->fresh()->address)->toBeNull();
});

it('wipes the polymorphic address row when the academy is deleted via Eloquent (#72)', function (): void {
    $user = User::factory()->create();
    $academy = Academy::factory()->create(['user_id' => $user->id]);
    Address::factory()->create([
        'addressable_type' => Academy::class,
        'addressable_id' => $academy->id,
    ]);

    expect(Address::where('addressable_type', Academy::class)
        ->where('addressable_id', $academy->id)
        ->count())->toBe(1);

    $academy->delete();

    expect(Address::where('addressable_type', Academy::class)
        ->where('addressable_id', $academy->id)
        ->count())->toBe(0);
});

// ─── training_days (#88a) ────────────────────────────────────────────────────

it('persists training_days on POST /academy as an ordered list of weekday ints (#88a)', function (): void {
    Sanctum::actingAs(User::factory()->create());

    $this->postJson('/api/v1/academy', [
        'name' => 'Eagles BJJ',
        // Carbon convention: 0=Sun … 6=Sat. Tue/Thu/Sat = [2,4,6].
        'training_days' => [2, 4, 6],
    ])
        ->assertCreated()
        ->assertJsonPath('data.training_days', [2, 4, 6]);
});

it('updates training_days via PATCH /academy', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['training_days' => [1, 3, 5]])
        ->assertOk()
        ->assertJsonPath('data.training_days', [1, 3, 5]);
});

it('clears training_days when explicitly set to null', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id, 'training_days' => [2, 4, 6]]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['training_days' => null])
        ->assertOk()
        ->assertJsonPath('data.training_days', null);
});

it('rejects training_days with values outside 0..6', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['training_days' => [2, 7]])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['training_days.1']);
});

it('rejects training_days with duplicate weekdays', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['training_days' => [2, 2, 4]])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['training_days.0', 'training_days.1']);
});

it('rejects training_days with non-integer entries', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['training_days' => ['mon', 'wed']])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['training_days.0', 'training_days.1']);
});

it('rejects an empty training_days array — "not configured" must be expressed as null', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['training_days' => []])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['training_days']);
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

// ─── Phone (#161) — same shape as athletes (#75) ─────────────────────────────

it('persists the academy phone pair via PATCH /academy', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id, 'phone_country_code' => null]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', [
        'phone_country_code' => '+39',
        'phone_national_number' => '3331234567',
    ])
        ->assertOk()
        ->assertJsonPath('data.phone_country_code', '+39')
        ->assertJsonPath('data.phone_national_number', '3331234567');

    $this->assertDatabaseHas('academies', [
        'user_id' => $user->id,
        'phone_country_code' => '+39',
        'phone_national_number' => '3331234567',
    ]);
});

it('clears the academy phone when both fields are sent as null', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create([
        'user_id' => $user->id,
        'phone_country_code' => '+39',
        'phone_national_number' => '3331234567',
    ]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', [
        'phone_country_code' => null,
        'phone_national_number' => null,
    ])
        ->assertOk()
        ->assertJsonPath('data.phone_country_code', null)
        ->assertJsonPath('data.phone_national_number', null);
});

it('rejects a half-filled phone pair (only country_code)', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', [
        'phone_country_code' => '+39',
        'phone_national_number' => null,
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['phone_national_number']);
});

it('rejects a half-filled phone pair (only national_number)', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', [
        'phone_country_code' => null,
        'phone_national_number' => '3331234567',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['phone_country_code']);
});

// `sometimes` would skip the missing-key's rules entirely, letting a PATCH
// that includes only ONE half of the pair sail through `required_with`
// (the other side's rule never runs because Laravel sees no key to validate).
// These two tests pin the no-`sometimes` shape on the phone pair.
it('rejects a phone pair when only country_code key is present (sibling key omitted)', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', [
        'phone_country_code' => '+39',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['phone_national_number']);
});

it('rejects a phone pair when only national_number key is present (sibling key omitted)', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', [
        'phone_national_number' => '3331234567',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['phone_country_code']);
});

it('rejects a phone number that fails libphonenumber validation', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', [
        'phone_country_code' => '+39',
        'phone_national_number' => '1', // too short — fails libphonenumber
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['phone_national_number']);
});

it('rejects malformed country code (e.g. without leading +)', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', [
        'phone_country_code' => '39',
        'phone_national_number' => '3331234567',
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['phone_country_code']);
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

// ─── #72 — structured address validation ─────────────────────────────────────

it('rejects an empty address object — `{}` is not a valid "I want to set an address" payload', function (): void {
    // Without the `min:1` rule on the address array, Laravel's `required_with`
    // wouldn't fire for an empty `{}` and the nested rules would all skip,
    // letting an address row through with every required field null.
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['address' => (object) []])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['address']);
});

it('rejects an address payload missing required fields', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    // Only line1 — every other required-with-address field is missing.
    $this->patchJson('/api/v1/academy', ['address' => ['line1' => 'Via Roma 1']])
        ->assertUnprocessable()
        ->assertJsonValidationErrors([
            'address.city',
            'address.postal_code',
            'address.province',
            'address.country',
        ]);
});

it('rejects an Italian postal code that is not exactly 5 digits', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', [
        'address' => validAddressPayload(['postal_code' => '123']),
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['address.postal_code']);
});

it('rejects a province that is not an ISO 3166-2:IT code', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', [
        'address' => validAddressPayload(['province' => 'XX']),
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['address.province']);
});

it('rejects a country that is not currently supported (MVP is IT-only)', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', [
        'address' => validAddressPayload(['country' => 'FR']),
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['address.country']);
});

it('rejects address.line1 longer than 255 characters', function (): void {
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', [
        'address' => validAddressPayload(['line1' => str_repeat('a', 256)]),
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['address.line1']);
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
