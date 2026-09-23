<?php

declare(strict_types=1);

use App\Enums\AthleteStatus;
use App\Enums\MartialArt;
use App\Models\Athlete;
use Carbon\CarbonImmutable;
use Laravel\Sanctum\Sanctum;

afterEach(function (): void {
    CarbonImmutable::setTestNow(null);
});

it('returns 13 IBJJF age divisions, all present, in canonical order', function (): void {
    Sanctum::actingAs(userWithAcademy());

    $payload = $this->getJson('/api/v1/stats/athletes/age-bands')->assertOk()->json('data');

    $codes = collect($payload['bands'])->pluck('code')->all();
    expect($codes)->toBe([
        'mighty_mite', 'pee_wee', 'junior', 'teen',
        'juvenile', 'adult',
        'master_1', 'master_2', 'master_3', 'master_4', 'master_5', 'master_6', 'master_7',
    ]);

    foreach ($payload['bands'] as $band) {
        expect($band)->toHaveKeys(['code', 'category', 'min', 'max', 'count']);
    }

    // master_7 is open-ended at the top.
    $master7 = collect($payload['bands'])->firstWhere('code', 'master_7');
    expect($master7['max'])->toBeNull();
});

it('counts athletes by the age they reach this calendar year, as the federations do (#1807)', function (): void {
    $user = userWithAcademy();

    CarbonImmutable::setTestNow(CarbonImmutable::create(2026, 5, 15));

    // Born on New Year's Eve 2010: 15 today, 16 this year → juvenile, not
    // teen. The federations class by year of birth; today's age would put
    // them in the division below until December.
    Athlete::factory()->for($user->academy)->create(['date_of_birth' => '2010-12-31']);
    // Born the next morning: 15 this year → teen.
    Athlete::factory()->for($user->academy)->create(['date_of_birth' => '2011-01-01']);
    // 28 this year → adult; 33 → master_1.
    Athlete::factory()->for($user->academy)->create(['date_of_birth' => '1998-05-14']);
    Athlete::factory()->for($user->academy)->create(['date_of_birth' => '1993-01-01']);

    Sanctum::actingAs($user);
    $payload = $this->getJson('/api/v1/stats/athletes/age-bands')->assertOk()->json('data');

    $byCode = collect($payload['bands'])->keyBy('code');
    expect($byCode['juvenile']['count'])->toBe(1)
        ->and($byCode['teen']['count'])->toBe(1)
        ->and($byCode['adult']['count'])->toBe(1)
        ->and($byCode['master_1']['count'])->toBe(1)
        ->and($payload['total'])->toBe(4)
        ->and($payload['missing_dob'])->toBe(0);
});

it('answers a judo academy in FIJLKAM classes, never an IBJJF one (#1807)', function (): void {
    $user = userWithAcademy();
    $user->academy->update(['martial_art' => MartialArt::Judo]);
    CarbonImmutable::setTestNow(CarbonImmutable::create(2026, 9, 23));

    // 12 in 2026 → Esordienti A; 30 → Seniores.
    Athlete::factory()->for($user->academy)->create(['date_of_birth' => '2014-11-02']);
    Athlete::factory()->for($user->academy)->create(['date_of_birth' => '1996-03-10']);

    Sanctum::actingAs($user);
    $payload = $this->getJson('/api/v1/stats/athletes/age-bands')->assertOk()->json('data');

    $codes = collect($payload['bands'])->pluck('code');
    expect($codes->all())->toBe([
        'bambini_a', 'bambini_b', 'fanciulli', 'ragazzi',
        'esordienti_a', 'esordienti_b', 'cadetti', 'juniores', 'seniores', 'master',
    ])
        ->and($codes->intersect(['mighty_mite', 'adult', 'master_1'])->all())->toBe([])
        ->and(collect($payload['bands'])->keyBy('code')['esordienti_a']['count'])->toBe(1)
        ->and(collect($payload['bands'])->keyBy('code')['seniores']['count'])->toBe(1);
});

it('counts NULL date_of_birth as missing_dob, NOT in any band', function (): void {
    $user = userWithAcademy();

    Athlete::factory()->for($user->academy)->create(['date_of_birth' => null]);
    Athlete::factory()->for($user->academy)->create(['date_of_birth' => null]);
    Athlete::factory()->for($user->academy)->create(['date_of_birth' => '1990-01-01']);

    Sanctum::actingAs($user);
    $payload = $this->getJson('/api/v1/stats/athletes/age-bands')->assertOk()->json('data');

    $totalInBands = collect($payload['bands'])->sum('count');
    expect($totalInBands)->toBe(1);
    expect($payload['total'])->toBe(3);
    expect($payload['missing_dob'])->toBe(2);
});

it('isolates academies on age-bands aggregation', function (): void {
    $userA = userWithAcademy();
    $userB = userWithAcademy();

    Athlete::factory()->for($userB->academy)->create(['date_of_birth' => '1990-01-01']);

    Sanctum::actingAs($userA);
    $payload = $this->getJson('/api/v1/stats/athletes/age-bands')->assertOk()->json('data');

    expect(collect($payload['bands'])->sum('count'))->toBe(0);
    expect($payload['total'])->toBe(0);
});

it('counts only athletes who still train here (#1538)', function (): void {
    // The chart describes who is on the mat. Counting the people who left
    // inflates every band, and nothing on the page says it is doing that —
    // the same defect the belt donut had, and the same answer the roster has
    // given since #1403.
    $user = userWithAcademy();

    Athlete::factory()->for($user->academy)->create([
        'date_of_birth' => '1990-01-01',
        'status' => AthleteStatus::Active,
    ]);
    Athlete::factory()->for($user->academy)->create([
        'date_of_birth' => '1992-01-01',
        'status' => AthleteStatus::Inactive,
    ]);

    Sanctum::actingAs($user);
    $payload = $this->getJson('/api/v1/stats/athletes/age-bands')->assertOk()->json('data');

    expect(collect($payload['bands'])->sum('count'))->toBe(1)
        ->and($payload['total'])->toBe(1);
});

it('rejects unauthenticated callers on age-bands endpoint', function (): void {
    $this->getJson('/api/v1/stats/athletes/age-bands')->assertUnauthorized();
});
