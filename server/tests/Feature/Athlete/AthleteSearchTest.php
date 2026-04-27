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
    Sanctum::actingAs($this->user);
});

function seedNamedAthlete(Academy $academy, string $first, string $last): Athlete
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

it('filters athletes by partial first_name match (case-insensitive)', function (): void {
    seedNamedAthlete($this->academy, 'Mario', 'Rossi');
    seedNamedAthlete($this->academy, 'Luigi', 'Verdi');
    seedNamedAthlete($this->academy, 'Matteo', 'Bianchi');

    $names = collect($this->getJson('/api/v1/athletes?q=mar')
        ->json('data'))
        ->map(fn ($a) => $a['first_name'] . ' ' . $a['last_name'])
        ->all();

    expect($names)->toContain('Mario Rossi');
    expect($names)->not->toContain('Luigi Verdi');
});

it('filters athletes by partial last_name match', function (): void {
    seedNamedAthlete($this->academy, 'Mario', 'Rossi');
    seedNamedAthlete($this->academy, 'Luigi', 'Verdi');
    seedNamedAthlete($this->academy, 'Anna', 'Rosaria');

    // 'ros' matches 'Rossi' (last_name) and 'Rosaria' (last_name), not 'Verdi'.
    $rows = collect($this->getJson('/api/v1/athletes?q=ros')
        ->json('data'))
        ->pluck('last_name')
        ->all();

    expect($rows)->toContain('Rossi');
    expect($rows)->toContain('Rosaria');
    expect($rows)->not->toContain('Verdi');
});

it('matches when each whitespace-separated token hits either first_name or last_name', function (): void {
    seedNamedAthlete($this->academy, 'Mario', 'Rossi');
    seedNamedAthlete($this->academy, 'Marco', 'Rossini');

    // Token-AND semantics: q=`Mario Ros` splits into ['Mario', 'Ros']; each
    // token must match SOME column (first_name OR last_name) for the row to
    // qualify. Mario Rossi: 'Mario' hits first_name, 'Ros' hits last_name → ok.
    // Marco Rossini: 'Mario' matches neither column → out. The user
    // experience is "type the words you remember in any order", which reads
    // like a CONCAT search but the implementation is portable across
    // MySQL/SQLite via plain `where + orWhere` clauses.
    $rows = collect($this->getJson('/api/v1/athletes?q=Mario+Ros')
        ->json('data'))
        ->pluck('last_name')
        ->all();

    expect($rows)->toBe(['Rossi']);
});

it('returns the full list when q is empty or whitespace-only', function (): void {
    seedNamedAthlete($this->academy, 'Mario', 'Rossi');
    seedNamedAthlete($this->academy, 'Luigi', 'Verdi');
    seedNamedAthlete($this->academy, 'Anna', 'Bianchi');

    expect(count($this->getJson('/api/v1/athletes?q=')->json('data')))->toBe(3);
    expect(count($this->getJson('/api/v1/athletes?q=%20%20')->json('data')))->toBe(3);
});

it('combines q with belt and status filters (AND)', function (): void {
    seedNamedAthlete($this->academy, 'Mario', 'Rossi');
    Athlete::factory()->create([
        'academy_id' => $this->academy->id,
        'first_name' => 'Mario', 'last_name' => 'Bianchi',
        'belt' => Belt::Blue, 'stripes' => 0, 'status' => AthleteStatus::Active,
    ]);
    Athlete::factory()->create([
        'academy_id' => $this->academy->id,
        'first_name' => 'Mario', 'last_name' => 'Verdi',
        'belt' => Belt::White, 'stripes' => 0, 'status' => AthleteStatus::Suspended,
    ]);

    // Search "mario" + belt=white + status=active → only "Mario Rossi" qualifies.
    $rows = collect($this->getJson('/api/v1/athletes?q=mario&belt=white&status=active')
        ->json('data'))
        ->map(fn ($a) => $a['first_name'] . ' ' . $a['last_name'])
        ->all();

    expect($rows)->toBe(['Mario Rossi']);
});
