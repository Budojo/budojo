<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Address;
use App\Models\Athlete;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * Default-valid structured address payload (#72b) for athlete tests that
 * need an address but don't care about specific values.
 *
 * @return array<string, mixed>
 */
function validAthleteAddressPayload(array $overrides = []): array
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

// helpers live in tests/Pest.php

// ─── LIST ─────────────────────────────────────────────────────────────────────

it('returns paginated list of athletes for the authenticated academy', function (): void {
    $user = userWithAcademy();
    Athlete::factory(3)->for($user->academy)->create();

    $this->actingAs($user)
        ->getJson('/api/v1/athletes')
        ->assertOk()
        ->assertJsonCount(3, 'data')
        ->assertJsonStructure(['data', 'meta']);
});

it('does not return soft-deleted athletes in the list', function (): void {
    $user = userWithAcademy();
    Athlete::factory(2)->for($user->academy)->create();
    Athlete::factory()->for($user->academy)->create(['deleted_at' => now()]);

    $this->actingAs($user)
        ->getJson('/api/v1/athletes')
        ->assertOk()
        ->assertJsonCount(2, 'data');
});

it('filters athletes by belt', function (): void {
    $user = userWithAcademy();
    Athlete::factory(2)->for($user->academy)->create(['belt' => 'blue']);
    Athlete::factory()->for($user->academy)->create(['belt' => 'white']);

    $this->actingAs($user)
        ->getJson('/api/v1/athletes?belt=blue')
        ->assertOk()
        ->assertJsonCount(2, 'data');
});

it('filters athletes by status', function (): void {
    $user = userWithAcademy();
    Athlete::factory()->for($user->academy)->create(['status' => 'active']);
    Athlete::factory()->for($user->academy)->create(['status' => 'suspended']);

    $this->actingAs($user)
        ->getJson('/api/v1/athletes?status=suspended')
        ->assertOk()
        ->assertJsonCount(1, 'data');
});

it('returns 401 on list without auth', function (): void {
    $this->getJson('/api/v1/athletes')->assertUnauthorized();
});

it('returns 403 with "No academy found." on list when user has no academy', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->getJson('/api/v1/athletes')
        ->assertForbidden()
        ->assertExactJson(['message' => 'No academy found.']);
});

// ─── STORE ────────────────────────────────────────────────────────────────────

it('creates an athlete for the authenticated academy', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/athletes', [
            'first_name' => 'Mario',
            'last_name' => 'Rossi',
            'belt' => 'white',
            'stripes' => 2,
            'status' => 'active',
            'joined_at' => '2024-01-15',
        ])
        ->assertCreated()
        ->assertJsonPath('data.first_name', 'Mario')
        ->assertJsonPath('data.belt', 'white');

    expect($user->academy->athletes()->count())->toBe(1);
});

it('returns 422 when required fields are missing on store', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/athletes', [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['first_name', 'last_name', 'belt', 'status', 'joined_at']);
});

it('returns 422 when belt value is invalid', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->postJson('/api/v1/athletes', [
            'first_name' => 'Mario',
            'last_name' => 'Rossi',
            'belt' => 'red',
            'status' => 'active',
            'joined_at' => '2024-01-15',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['belt']);
});

it('returns 422 when email is already used in the same academy', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['email' => 'mario@example.com']);

    $this->actingAs($user)
        ->postJson('/api/v1/athletes', [
            'first_name' => 'Luigi',
            'last_name' => 'Verdi',
            'email' => $athlete->email,
            'belt' => 'white',
            'status' => 'active',
            'joined_at' => '2024-01-15',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['email']);
});

it('allows the same email in a different academy', function (): void {
    $user = userWithAcademy();
    $otherAcademy = Academy::factory()->create();
    Athlete::factory()->for($otherAcademy)->create(['email' => 'mario@example.com']);

    $this->actingAs($user)
        ->postJson('/api/v1/athletes', [
            'first_name' => 'Mario',
            'last_name' => 'Rossi',
            'email' => 'mario@example.com',
            'belt' => 'white',
            'status' => 'active',
            'joined_at' => '2024-01-15',
        ])
        ->assertCreated();
});

it('returns 401 on store without auth', function (): void {
    $this->postJson('/api/v1/athletes', [])->assertUnauthorized();
});

it('returns 403 with "Forbidden." on store when user has no academy', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->postJson('/api/v1/athletes', [
            'first_name' => 'Mario',
            'last_name' => 'Rossi',
            'belt' => 'white',
            'status' => 'active',
            'joined_at' => '2024-01-15',
        ])
        ->assertForbidden()
        ->assertExactJson(['message' => 'Forbidden.']);
});

// ─── SHOW ─────────────────────────────────────────────────────────────────────

it('returns an athlete by id', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();

    $this->actingAs($user)
        ->getJson("/api/v1/athletes/{$athlete->id}")
        ->assertOk()
        ->assertJsonPath('data.id', $athlete->id);
});

it('returns 403 when showing an athlete that belongs to another academy', function (): void {
    $user = userWithAcademy();
    $otherAcademy = Academy::factory()->create();
    $athlete = Athlete::factory()->for($otherAcademy)->create();

    $this->actingAs($user)
        ->getJson("/api/v1/athletes/{$athlete->id}")
        ->assertForbidden();
});

it('returns 404 when athlete does not exist', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)
        ->getJson('/api/v1/athletes/99999')
        ->assertNotFound();
});

// ─── UPDATE ───────────────────────────────────────────────────────────────────

it('updates an athlete', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['belt' => 'white']);

    $this->actingAs($user)
        ->putJson("/api/v1/athletes/{$athlete->id}", ['belt' => 'blue'])
        ->assertOk()
        ->assertJsonPath('data.belt', 'blue');
});

it('allows updating an athlete with their own email', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['email' => 'mario@example.com']);

    $this->actingAs($user)
        ->putJson("/api/v1/athletes/{$athlete->id}", ['email' => 'mario@example.com'])
        ->assertOk();
});

it('returns 422 when updating email to one already used in the same academy', function (): void {
    $user = userWithAcademy();
    $athlete1 = Athlete::factory()->for($user->academy)->create(['email' => 'mario@example.com']);
    $athlete2 = Athlete::factory()->for($user->academy)->create(['email' => 'luigi@example.com']);

    $this->actingAs($user)
        ->putJson("/api/v1/athletes/{$athlete2->id}", ['email' => $athlete1->email])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['email']);
});

it('returns 403 when updating an athlete that belongs to another academy', function (): void {
    $user = userWithAcademy();
    $otherAcademy = Academy::factory()->create();
    $athlete = Athlete::factory()->for($otherAcademy)->create();

    $this->actingAs($user)
        ->putJson("/api/v1/athletes/{$athlete->id}", ['belt' => 'blue'])
        ->assertForbidden();
});

it('returns 403 with "Forbidden." on update when user has no academy', function (): void {
    $user = User::factory()->create();
    $otherAcademy = Academy::factory()->create();
    $athlete = Athlete::factory()->for($otherAcademy)->create();

    $this->actingAs($user)
        ->putJson("/api/v1/athletes/{$athlete->id}", ['belt' => 'blue'])
        ->assertForbidden()
        ->assertExactJson(['message' => 'Forbidden.']);
});

// ─── DESTROY ──────────────────────────────────────────────────────────────────

it('soft-deletes an athlete', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();

    $this->actingAs($user)
        ->deleteJson("/api/v1/athletes/{$athlete->id}")
        ->assertNoContent();

    expect(Athlete::withTrashed()->find($athlete->id)?->deleted_at)->not->toBeNull();
    expect(Athlete::find($athlete->id))->toBeNull();
});

it('returns 403 when deleting an athlete that belongs to another academy', function (): void {
    $user = userWithAcademy();
    $otherAcademy = Academy::factory()->create();
    $athlete = Athlete::factory()->for($otherAcademy)->create();

    $this->actingAs($user)
        ->deleteJson("/api/v1/athletes/{$athlete->id}")
        ->assertForbidden();
});

// ─── #75 — structured phone validation ────────────────────────────────────────

it('persists a valid phone pair via libphonenumber (#75)', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)->postJson('/api/v1/athletes', [
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'phone_country_code' => '+39',
        'phone_national_number' => '3331234567',
        'belt' => 'white',
        'stripes' => 0,
        'status' => 'active',
        'joined_at' => '2026-01-01',
    ])->assertCreated()
        ->assertJsonPath('data.phone_country_code', '+39')
        ->assertJsonPath('data.phone_national_number', '3331234567');
});

it('accepts both phone fields null — the pair is optional (#75)', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)->postJson('/api/v1/athletes', [
        'first_name' => 'Luigi',
        'last_name' => 'Verdi',
        'phone_country_code' => null,
        'phone_national_number' => null,
        'belt' => 'white',
        'stripes' => 0,
        'status' => 'active',
        'joined_at' => '2026-01-01',
    ])->assertCreated()
        ->assertJsonPath('data.phone_country_code', null)
        ->assertJsonPath('data.phone_national_number', null);
});

it('rejects a phone with country code but no national number (#75)', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)->postJson('/api/v1/athletes', [
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'phone_country_code' => '+39',
        'phone_national_number' => null,
        'belt' => 'white',
        'stripes' => 0,
        'status' => 'active',
        'joined_at' => '2026-01-01',
    ])->assertUnprocessable()
        ->assertJsonValidationErrors(['phone_national_number']);
});

it('rejects a phone with national number but no country code (#75)', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)->postJson('/api/v1/athletes', [
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'phone_country_code' => null,
        'phone_national_number' => '3331234567',
        'belt' => 'white',
        'stripes' => 0,
        'status' => 'active',
        'joined_at' => '2026-01-01',
    ])->assertUnprocessable()
        ->assertJsonValidationErrors(['phone_country_code']);
});

it('rejects a country code that does not start with `+` (#75)', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)->postJson('/api/v1/athletes', [
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'phone_country_code' => '39', // missing leading +
        'phone_national_number' => '3331234567',
        'belt' => 'white',
        'stripes' => 0,
        'status' => 'active',
        'joined_at' => '2026-01-01',
    ])->assertUnprocessable()
        ->assertJsonValidationErrors(['phone_country_code']);
});

it('rejects a phone combination that libphonenumber considers unreachable (#75)', function (): void {
    $user = userWithAcademy();

    // Italian prefix with a digit count no Italian numbering plan covers.
    // Both fields are individually well-formed (regex-valid), but the
    // combination fails libphonenumber's `isValidNumber`.
    $this->actingAs($user)->postJson('/api/v1/athletes', [
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'phone_country_code' => '+39',
        'phone_national_number' => '1', // way too short
        'belt' => 'white',
        'stripes' => 0,
        'status' => 'active',
        'joined_at' => '2026-01-01',
    ])->assertUnprocessable()
        ->assertJsonValidationErrors(['phone_national_number']);
});

// ─── #75 — update flow stays in lockstep with create ──────────────────────────

it('updates the phone pair on an existing athlete (#75)', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create([
        'phone_country_code' => null,
        'phone_national_number' => null,
    ]);

    $this->actingAs($user)
        ->putJson("/api/v1/athletes/{$athlete->id}", [
            'phone_country_code' => '+39',
            'phone_national_number' => '3331234567',
        ])
        ->assertOk()
        ->assertJsonPath('data.phone_country_code', '+39')
        ->assertJsonPath('data.phone_national_number', '3331234567');
});

it('rejects an update that fills only one half of the phone pair (#75)', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create([
        'phone_country_code' => null,
        'phone_national_number' => null,
    ]);

    $this->actingAs($user)
        ->putJson("/api/v1/athletes/{$athlete->id}", [
            'phone_country_code' => '+39',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['phone_national_number']);
});

it('rejects an update where the pair is unreachable per libphonenumber (#75)', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create([
        'phone_country_code' => '+39',
        'phone_national_number' => '3331234567',
    ]);

    $this->actingAs($user)
        ->putJson("/api/v1/athletes/{$athlete->id}", [
            'phone_country_code' => '+39',
            'phone_national_number' => '1',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['phone_national_number']);
});

// ─── #72b — structured address ───────────────────────────────────────────────

it('creates an athlete with a structured address (#72b)', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)->postJson('/api/v1/athletes', [
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'belt' => 'white',
        'stripes' => 0,
        'status' => 'active',
        'joined_at' => '2026-01-01',
        'address' => validAthleteAddressPayload(['line1' => 'Via Mario 5', 'city' => 'Milano', 'postal_code' => '20100', 'province' => 'MI']),
    ])->assertCreated()
        ->assertJsonPath('data.address.line1', 'Via Mario 5')
        ->assertJsonPath('data.address.city', 'Milano')
        ->assertJsonPath('data.address.province', 'MI')
        ->assertJsonPath('data.address.country', 'IT');

    $athlete = $user->academy->athletes()->latest('id')->first();
    expect($athlete?->address)->not->toBeNull();
    expect($athlete?->address?->city)->toBe('Milano');
});

it('creates an athlete without an address (#72b — address is optional)', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)->postJson('/api/v1/athletes', [
        'first_name' => 'Luigi',
        'last_name' => 'Verdi',
        'belt' => 'white',
        'status' => 'active',
        'joined_at' => '2026-01-01',
    ])->assertCreated()
        ->assertJsonPath('data.address', null);
});

it('upserts an athlete address via PUT when the athlete has none (#72b)', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();

    $this->actingAs($user)->putJson("/api/v1/athletes/{$athlete->id}", [
        'address' => validAthleteAddressPayload(['line1' => 'Via Nuova 10', 'city' => 'Torino', 'province' => 'TO', 'postal_code' => '10100']),
    ])->assertOk()
        ->assertJsonPath('data.address.line1', 'Via Nuova 10')
        ->assertJsonPath('data.address.province', 'TO');

    expect($athlete->fresh()?->address?->city)->toBe('Torino');
});

it('replaces an existing athlete address via PUT (idempotent upsert) (#72b)', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    Address::factory()->create([
        'addressable_type' => Athlete::class,
        'addressable_id' => $athlete->id,
        'line1' => 'Via Vecchia 1',
        'city' => 'Roma',
        'province' => 'RM',
        'postal_code' => '00100',
        'country' => 'IT',
    ]);

    $this->actingAs($user)->putJson("/api/v1/athletes/{$athlete->id}", [
        'address' => validAthleteAddressPayload(['line1' => 'Via Nuova 99', 'city' => 'Milano', 'province' => 'MI', 'postal_code' => '20100']),
    ])->assertOk()
        ->assertJsonPath('data.address.line1', 'Via Nuova 99');

    expect(Address::where('addressable_type', Athlete::class)
        ->where('addressable_id', $athlete->id)
        ->count())->toBe(1);
});

it('clears the athlete address when explicitly set to null (#72b)', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    Address::factory()->create([
        'addressable_type' => Athlete::class,
        'addressable_id' => $athlete->id,
        'line1' => 'Via da cancellare 5',
    ]);

    $this->actingAs($user)->putJson("/api/v1/athletes/{$athlete->id}", ['address' => null])
        ->assertOk()
        ->assertJsonPath('data.address', null);

    expect($athlete->fresh()?->address)->toBeNull();
});

it('rejects an athlete address payload missing required fields (#72b)', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();

    $this->actingAs($user)->putJson("/api/v1/athletes/{$athlete->id}", [
        'address' => ['line1' => 'Via Roma 1'],
    ])->assertUnprocessable()
        ->assertJsonValidationErrors(['address.city', 'address.postal_code', 'address.province', 'address.country']);
});

it('rejects an athlete address with an invalid province code (#72b)', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();

    $this->actingAs($user)->putJson("/api/v1/athletes/{$athlete->id}", [
        'address' => validAthleteAddressPayload(['province' => 'XX']),
    ])->assertUnprocessable()
        ->assertJsonValidationErrors(['address.province']);
});

it('hard-deletes the address when an athlete is force-deleted (#72b)', function (): void {
    // The polymorphic table has no FK to athletes, so without an observer
    // hook the address would orphan when the parent is permanently deleted.
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    Address::factory()->create([
        'addressable_type' => Athlete::class,
        'addressable_id' => $athlete->id,
    ]);

    $athlete->forceDelete();

    expect(Address::where('addressable_type', Athlete::class)
        ->where('addressable_id', $athlete->id)
        ->count())->toBe(0);
});

it('keeps the address when an athlete is soft-deleted (#72b)', function (): void {
    // Soft-delete is recoverable — the address rides along with the
    // athlete row in the trashed state.
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create();
    Address::factory()->create([
        'addressable_type' => Athlete::class,
        'addressable_id' => $athlete->id,
    ]);

    $athlete->delete();

    expect(Address::where('addressable_type', Athlete::class)
        ->where('addressable_id', $athlete->id)
        ->count())->toBe(1);
});

// ─── #162 — contact links (website / facebook / instagram) ────────────────────

it('persists the contact links on store', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)->postJson('/api/v1/athletes', [
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        'website' => 'https://mariorossi.com',
        'facebook' => 'https://facebook.com/mariorossi',
        'instagram' => 'https://instagram.com/mariorossi',
        'belt' => 'white',
        'stripes' => 0,
        'status' => 'active',
        'joined_at' => '2026-01-01',
    ])->assertCreated()
        ->assertJsonPath('data.website', 'https://mariorossi.com')
        ->assertJsonPath('data.facebook', 'https://facebook.com/mariorossi')
        ->assertJsonPath('data.instagram', 'https://instagram.com/mariorossi');
});

it('accepts all contact link fields null — they are independently optional', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)->postJson('/api/v1/athletes', [
        'first_name' => 'Luigi',
        'last_name' => 'Verdi',
        'website' => null,
        'facebook' => null,
        'instagram' => null,
        'belt' => 'white',
        'stripes' => 0,
        'status' => 'active',
        'joined_at' => '2026-01-01',
    ])->assertCreated()
        ->assertJsonPath('data.website', null)
        ->assertJsonPath('data.facebook', null)
        ->assertJsonPath('data.instagram', null);
});

it('rejects a non-URL website with 422', function (): void {
    $user = userWithAcademy();

    $this->actingAs($user)->postJson('/api/v1/athletes', [
        'first_name' => 'Mario',
        'last_name' => 'Rossi',
        // Plain handle, not a URL — rejected by `url` rule. Users can paste
        // a full URL or leave blank; @handles aren't supported because the
        // SPA renders these as `<a href>` and a bare handle wouldn't link.
        'website' => '@mariorossi',
        'belt' => 'white',
        'stripes' => 0,
        'status' => 'active',
        'joined_at' => '2026-01-01',
    ])->assertUnprocessable()
        ->assertJsonValidationErrors(['website']);
});

it('updates contact links on PUT and persists null when explicitly cleared', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create([
        'website' => 'https://old.example',
        'facebook' => 'https://facebook.com/old',
        'instagram' => 'https://instagram.com/old',
    ]);

    $this->actingAs($user)->putJson("/api/v1/athletes/{$athlete->id}", [
        'website' => 'https://new.example',
        'facebook' => null,
        'instagram' => null,
    ])->assertOk()
        ->assertJsonPath('data.website', 'https://new.example')
        ->assertJsonPath('data.facebook', null)
        ->assertJsonPath('data.instagram', null);

    expect($athlete->fresh()->website)->toBe('https://new.example');
    expect($athlete->fresh()->facebook)->toBeNull();
    expect($athlete->fresh()->instagram)->toBeNull();
});
