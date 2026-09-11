<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\User;
use App\Support\NameFold;
use Laravel\Sanctum\Sanctum;

/**
 * Names order and match the way they READ, not the way they are encoded
 * (#1527).
 *
 * SQLite's default BINARY collation compares code points, which put `da Silva`
 * and `dos Santos` — two of the most common surnames in the sport this app is
 * for — below every capitalised name, and `Ângelo` one step below those.
 * Typing `angelo` found nobody at all.
 */
beforeEach(function (): void {
    $this->user = User::factory()->create();
    $this->academy = Academy::factory()->create(['user_id' => $this->user->id]);
    Sanctum::actingAs($this->user);
});

function collationAthlete(Academy $academy, string $first, string $last): Athlete
{
    return Athlete::factory()->create([
        'academy_id' => $academy->id,
        'first_name' => $first,
        'last_name' => $last,
        'belt' => Belt::White,
        'stripes' => 0,
        'status' => AthleteStatus::Active,
        'joined_at' => now()->subYear(),
    ]);
}

/** The roster as a BJJ academy actually spells it. */
function seedMixedScriptRoster(Academy $academy): void
{
    collationAthlete($academy, 'Ângelo', 'da Silva');
    collationAthlete($academy, 'Erika', 'dos Santos');
    collationAthlete($academy, 'Mario', 'Rossi');
    collationAthlete($academy, 'Zoe', 'Zanetti');
    collationAthlete($academy, 'Ángela', 'Costa');
    collationAthlete($academy, 'Oscar', 'Núñez');
    collationAthlete($academy, 'Anna', 'Öztürk');
}

function sortedLastNames(string $query): array
{
    return collect(test()->getJson($query)->json('data'))->pluck('last_name')->all();
}

it('puts the lower-case particles where a reader looks for them, not after Z', function (): void {
    seedMixedScriptRoster($this->academy);

    expect(sortedLastNames('/api/v1/athletes?sort_by=last_name&sort_order=asc'))->toBe([
        'Costa',
        'da Silva',
        'dos Santos',
        'Núñez',
        'Öztürk',
        'Rossi',
        'Zanetti',
    ]);
});

it('sorts an accented initial with its plain letter, not past the end of the alphabet', function (): void {
    // `Ö` is the one that survived the first attempt at this: SQLite's
    // `lower()` is ASCII-only, so an upper-case accent walks through it
    // untouched and lands beyond `z`.
    collationAthlete($this->academy, 'Anna', 'Öztürk');
    collationAthlete($this->academy, 'Zoe', 'Zanetti');
    collationAthlete($this->academy, 'Paolo', 'Pauli');

    expect(sortedLastNames('/api/v1/athletes?sort_by=last_name&sort_order=asc'))
        ->toBe(['Öztürk', 'Pauli', 'Zanetti']);
});

it('reverses the folded order on desc, not the raw one', function (): void {
    seedMixedScriptRoster($this->academy);

    expect(sortedLastNames('/api/v1/athletes?sort_by=last_name&sort_order=desc'))->toBe([
        'Zanetti',
        'Rossi',
        'Öztürk',
        'Núñez',
        'dos Santos',
        'da Silva',
        'Costa',
    ]);
});

it('folds the first-name lead too, and its tiebreak', function (): void {
    collationAthlete($this->academy, 'Élena', 'Verdi');
    collationAthlete($this->academy, 'Elena', 'Bianchi');
    collationAthlete($this->academy, 'Zoe', 'Adamo');

    $rows = collect($this->getJson('/api/v1/athletes?sort_by=first_name&sort_order=asc')->json('data'))
        ->map(fn (array $r): string => "{$r['first_name']} {$r['last_name']}")
        ->all();

    // Both Elenas lead Zoe, and between them the surname decides — with the
    // raw columns `Élena` would have sorted after `Zoe`.
    expect($rows)->toBe(['Elena Bianchi', 'Élena Verdi', 'Zoe Adamo']);
});

it('holds a tied name in a stable order across pages', function (): void {
    // Folding makes ties MORE common — `de Luca` and `De Luca` now collide
    // where they used to be far apart. Without a final key the tied block can
    // reorder between two requests for different pages, and an athlete lands
    // on both or on neither.
    foreach (range(1, 3) as $i) {
        collationAthlete($this->academy, 'Elena', 'de Luca');
    }

    $first = collect($this->getJson('/api/v1/athletes?sort_by=last_name&sort_order=asc')->json('data'))
        ->pluck('id')->all();
    $again = collect($this->getJson('/api/v1/athletes?sort_by=last_name&sort_order=asc')->json('data'))
        ->pluck('id')->all();

    expect($first)->toBe($again)
        ->and($first)->toBe(array_values(array_unique($first)));
});

it('finds an accented name from the plain spelling', function (): void {
    seedMixedScriptRoster($this->academy);

    $found = collect($this->getJson('/api/v1/athletes?q=angelo')->json('data'))
        ->pluck('first_name')->all();

    expect($found)->toBe(['Ângelo']);
});

it('finds a name from its accented spelling too', function (): void {
    seedMixedScriptRoster($this->academy);

    // The needle is folded before it meets the folded column, so either
    // spelling of the query reaches the same row.
    $found = collect($this->getJson('/api/v1/athletes?q=öztürk')->json('data'))
        ->pluck('last_name')->all();

    expect($found)->toBe(['Öztürk']);
});

it('still AND-matches tokens across the two columns', function (): void {
    seedMixedScriptRoster($this->academy);

    // The #196 behaviour has to survive the column swap: "Angelo Silva" is one
    // token per column, and both must hit.
    $found = collect($this->getJson('/api/v1/athletes?q=angelo+silva')->json('data'))
        ->pluck('last_name')->all();

    expect($found)->toBe(['da Silva']);
});

it('stores a key that matches the fold, for every name in the fixture', function (): void {
    // The keys are WRITTEN by `AthleteObserver::saving()`, not derived by the
    // database — a generated column turned out not to be portable across
    // SQLite builds. So the guard is that the observer actually ran and stored
    // the right thing, read straight off the row rather than through Eloquent.
    $names = [
        'Ângelo', 'da Silva', 'Öztürk', 'Núñez', 'Élena', 'Straße',
        'Æbelø', 'Jürgen', 'Müller', 'Renée', 'Škoda', 'Łukasz', 'Français',
        // Outside the map, and that is the point: `fold()` leaves them as
        // written, and so must the stored key.
        'Şahin', 'Ana Şahin', 'Żuk', 'Ğokhan', 'Ōmura', 'İstanbul', 'Đoković',
    ];

    foreach ($names as $name) {
        $athlete = collationAthlete($this->academy, $name, $name);

        $row = DB::table('athletes')
            ->where('id', $athlete->id)
            ->first(['first_name_sort', 'last_name_sort']);

        expect($row->first_name_sort)->toBe(
            NameFold::fold($name),
            "the stored sort key for '{$name}' is not what NameFold::fold() produces",
        );
        expect($row->last_name_sort)->toBe(NameFold::fold($name));
    }
});

it('re-folds the key when the name is renamed', function (): void {
    // The half a generated column got for free. A rename that left the old key
    // behind would leave the athlete sorted and findable under a name they no
    // longer have — and nothing on screen would say so.
    $athlete = collationAthlete($this->academy, 'Mario', 'Rossi');

    $athlete->update(['first_name' => 'Ângelo', 'last_name' => 'da Silva']);

    $row = DB::table('athletes')->where('id', $athlete->id)->first(['first_name_sort', 'last_name_sort']);
    expect($row->first_name_sort)->toBe('angelo')
        ->and($row->last_name_sort)->toBe('da silva');

    // And the rename is reachable through the API it changed.
    expect(collect($this->getJson('/api/v1/athletes?q=angelo')->json('data'))->pluck('last_name')->all())
        ->toBe(['da Silva']);
});

it('folds a name written straight through the model, not just the API', function (): void {
    // The CSV import, the seeder and the factory all take this path.
    $athlete = Athlete::factory()->create([
        'academy_id' => $this->academy->id,
        'first_name' => 'Érika',
        'last_name' => 'dos Santos',
    ]);

    $row = DB::table('athletes')->where('id', $athlete->id)->first(['first_name_sort', 'last_name_sort']);
    expect($row->first_name_sort)->toBe('erika')
        ->and($row->last_name_sort)->toBe('dos santos');
});

it('folds every pair in the map, in both cases', function (): void {
    foreach (NameFold::MAP as $accented => $plain) {
        expect(NameFold::fold($accented))->toBe($plain);
        expect(NameFold::fold(mb_strtoupper($accented)))->toBe($plain);
    }
});
