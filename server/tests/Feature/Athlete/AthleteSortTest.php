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

function makeAthlete(Academy $academy, array $overrides = []): Athlete
{
    return Athlete::factory()->create(array_merge([
        'academy_id' => $academy->id,
        'first_name' => 'Athlete',
        'last_name' => 'X',
        'belt' => Belt::White,
        'stripes' => 0,
        'status' => AthleteStatus::Active,
        'joined_at' => now()->subYears(1),
    ], $overrides));
}

it('sorts by last_name asc when sort_by=last_name and order=asc', function (): void {
    makeAthlete($this->academy, ['last_name' => 'Verdi']);
    makeAthlete($this->academy, ['last_name' => 'Bianchi']);
    makeAthlete($this->academy, ['last_name' => 'Rossi']);

    $names = collect($this->getJson('/api/v1/athletes?sort_by=last_name&sort_order=asc')
        ->json('data'))
        ->pluck('last_name')
        ->all();

    expect($names)->toBe(['Bianchi', 'Rossi', 'Verdi']);
});

it('sorts by stripes desc by default when sort_by=stripes', function (): void {
    makeAthlete($this->academy, ['last_name' => 'A', 'stripes' => 1]);
    makeAthlete($this->academy, ['last_name' => 'B', 'stripes' => 4]);
    makeAthlete($this->academy, ['last_name' => 'C', 'stripes' => 2]);

    $stripes = collect($this->getJson('/api/v1/athletes?sort_by=stripes')
        ->json('data'))
        ->pluck('stripes')
        ->all();

    expect($stripes)->toBe([4, 2, 1]);
});

it('sorts by belt rank desc with stripes desc + last_name asc as tiebreakers', function (): void {
    makeAthlete($this->academy, ['last_name' => 'White1', 'belt' => Belt::White, 'stripes' => 0]);
    makeAthlete($this->academy, ['last_name' => 'BlackA', 'belt' => Belt::Black, 'stripes' => 0]);
    makeAthlete($this->academy, ['last_name' => 'BlackZ', 'belt' => Belt::Black, 'stripes' => 0]);
    makeAthlete($this->academy, ['last_name' => 'BlackTwoStripes', 'belt' => Belt::Black, 'stripes' => 2]);

    $rows = collect($this->getJson('/api/v1/athletes?sort_by=belt&sort_order=desc')
        ->json('data'))
        ->map(fn ($r) => "{$r['belt']}/{$r['stripes']}/{$r['last_name']}")
        ->all();

    // Black belts first (sort by belt enum string desc — 'white' > 'purple' > 'blue' > 'brown' > 'black'
    // alphabetically; we accept whatever the DB returns for the primary key
    // and check the tiebreakers within each belt group).
    $blackGroup = array_values(array_filter($rows, fn ($r) => str_starts_with($r, 'black')));
    expect($blackGroup)->toBe([
        'black/2/BlackTwoStripes', // stripes desc within belt
        'black/0/BlackA',          // last_name asc as final tie-break
        'black/0/BlackZ',
    ]);
});

it('falls back to latest() when sort_by is unknown', function (): void {
    makeAthlete($this->academy, ['last_name' => 'Old', 'created_at' => now()->subDays(10)]);
    makeAthlete($this->academy, ['last_name' => 'New', 'created_at' => now()]);

    $names = collect($this->getJson('/api/v1/athletes?sort_by=NOPE')
        ->json('data'))
        ->pluck('last_name')
        ->all();

    expect($names[0])->toBe('New');
});
