<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\User;
use Laravel\Sanctum\Sanctum;

beforeEach(function (): void {
    $this->user = User::factory()->create();
    $this->academy = Academy::factory()->create(['user_id' => $this->user->id]);
});

/**
 * Mirror of the AthleteSearchTest helper — small named seeder so the
 * specs read like sentences and the field set we care about (name +
 * belt + status) is the only knob each test touches.
 */
function seedSearchAthlete(Academy $academy, string $first, string $last): Athlete
{
    return Athlete::factory()->create([
        'academy_id' => $academy->id,
        'first_name' => $first,
        'last_name' => $last,
        'belt' => Belt::White,
        'stripes' => 0,
        'status' => AthleteStatus::Active,
    ]);
}

it('returns 401 when the request is unauthenticated', function (): void {
    // No Sanctum::actingAs — naked GET should bounce with 401 before the
    // controller is hit. The route lives under the `auth:sanctum` group;
    // this assertion locks that boundary so a future routes file edit
    // that accidentally hoists `/search` outside the group fails loudly.
    $this->getJson('/api/v1/search?q=mario')->assertUnauthorized();
});

it('returns an empty array when the query is empty', function (): void {
    Sanctum::actingAs($this->user);
    seedSearchAthlete($this->academy, 'Mario', 'Rossi');
    seedSearchAthlete($this->academy, 'Luigi', 'Verdi');

    // Empty / missing q means "do not load all athletes". Loading the full
    // roster on every keystroke would defeat the whole point of a quick-jump
    // palette — it's meant to render nothing until the user starts typing.
    $this->getJson('/api/v1/search?q=')
        ->assertOk()
        ->assertExactJson(['data' => []]);

    $this->getJson('/api/v1/search')
        ->assertOk()
        ->assertExactJson(['data' => []]);

    $this->getJson('/api/v1/search?q=%20%20')
        ->assertOk()
        ->assertExactJson(['data' => []]);
});

it('matches athletes by partial first_name or last_name', function (): void {
    Sanctum::actingAs($this->user);
    seedSearchAthlete($this->academy, 'Mario', 'Rossi');
    seedSearchAthlete($this->academy, 'Luigi', 'Verdi');
    seedSearchAthlete($this->academy, 'Anna', 'Rosaria');

    // 'ros' should hit Rossi (last_name) AND Rosaria (last_name); not Verdi.
    $rows = collect($this->getJson('/api/v1/search?q=ros')
        ->json('data'))
        ->pluck('last_name')
        ->all();

    expect($rows)->toContain('Rossi');
    expect($rows)->toContain('Rosaria');
    expect($rows)->not->toContain('Verdi');
});

it('supports token-AND search across first_name and last_name', function (): void {
    Sanctum::actingAs($this->user);
    seedSearchAthlete($this->academy, 'Mario', 'Rossi');
    seedSearchAthlete($this->academy, 'Marco', 'Rossini');

    // q='Mario Ros' splits into ['Mario','Ros']; each token must match one
    // of (first_name, last_name). 'Mario Rossi' qualifies; 'Marco Rossini'
    // does not (token 'Mario' matches neither column).
    $rows = collect($this->getJson('/api/v1/search?q=Mario+Ros')
        ->json('data'))
        ->pluck('last_name')
        ->all();

    expect($rows)->toBe(['Rossi']);
});

it('does not return athletes from other academies (academy-scoping)', function (): void {
    Sanctum::actingAs($this->user);
    // Athlete in MY academy.
    seedSearchAthlete($this->academy, 'Mario', 'Rossi');

    // Athlete with the SAME name on a DIFFERENT academy. The search must
    // never cross the academy boundary even though the LIKE match would
    // qualify globally — this is the central tenancy invariant.
    $otherUser = User::factory()->create();
    $otherAcademy = Academy::factory()->create(['user_id' => $otherUser->id]);
    seedSearchAthlete($otherAcademy, 'Mario', 'Foreigner');

    $rows = collect($this->getJson('/api/v1/search?q=mario')
        ->json('data'))
        ->map(fn ($a) => $a['first_name'] . ' ' . $a['last_name'])
        ->all();

    expect($rows)->toBe(['Mario Rossi']);
});

it('caps results at 20 even if more match', function (): void {
    Sanctum::actingAs($this->user);

    // Seed 25 athletes whose first_name all start with 'palette'. The
    // controller must cap at 20 — the palette is a quick-jump, not a list
    // page. A 25-result blob in a popover floods the user's working
    // memory (Miller's law) and the design assumes the typical user
    // narrows further by typing more characters.
    for ($i = 1; $i <= 25; $i++) {
        seedSearchAthlete($this->academy, "Palette{$i}", "Tester{$i}");
    }

    $rows = $this->getJson('/api/v1/search?q=palette')->json('data');

    expect(count($rows))->toBe(20);
});

it('does not return soft-deleted athletes', function (): void {
    Sanctum::actingAs($this->user);
    seedSearchAthlete($this->academy, 'Mario', 'Rossi');
    Athlete::factory()->create([
        'academy_id' => $this->academy->id,
        'first_name' => 'Mario',
        'last_name' => 'Deleted',
        'belt' => Belt::White,
        'stripes' => 0,
        'status' => AthleteStatus::Active,
        'deleted_at' => now(),
    ]);

    $rows = collect($this->getJson('/api/v1/search?q=mario')
        ->json('data'))
        ->pluck('last_name')
        ->all();

    expect($rows)->toBe(['Rossi']);
});

it('returns 403 when the authenticated user has no academy', function (): void {
    // A user with NO academy hitting /search isn't a valid V1 caller —
    // the SPA only renders the dashboard shell (and therefore the palette)
    // for users past the academy-setup guard. A defensive 403 here matches
    // the AthleteController::index shape so a misrouted call lands at the
    // same envelope, not a 500 from a null academy access.
    $orphan = User::factory()->create();
    Sanctum::actingAs($orphan);

    $this->getJson('/api/v1/search?q=mario')
        ->assertForbidden();
});
