<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

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

it('returns 403 on list when user has no academy', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->getJson('/api/v1/athletes')
        ->assertForbidden();
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

it('returns 403 on store when user has no academy', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->postJson('/api/v1/athletes', [
            'first_name' => 'Mario',
            'last_name' => 'Rossi',
            'belt' => 'white',
            'status' => 'active',
            'joined_at' => '2024-01-15',
        ])
        ->assertForbidden();
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
