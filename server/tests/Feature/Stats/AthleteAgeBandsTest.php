<?php

declare(strict_types=1);

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

it('counts athletes into the correct band based on age today', function (): void {
    $user = userWithAcademy();

    CarbonImmutable::setTestNow(CarbonImmutable::create(2026, 5, 15));

    // 28-year-old → adult
    Athlete::factory()->for($user->academy)->create([
        'date_of_birth' => '1998-05-14', // turned 28 yesterday
    ]);
    // 33-year-old → master_1
    Athlete::factory()->for($user->academy)->create([
        'date_of_birth' => '1993-01-01',
    ]);
    // 11-year-old → junior
    Athlete::factory()->for($user->academy)->create([
        'date_of_birth' => '2014-06-01', // birthday hasn't happened yet this year → still 11
    ]);

    Sanctum::actingAs($user);
    $payload = $this->getJson('/api/v1/stats/athletes/age-bands')->assertOk()->json('data');

    $byCode = collect($payload['bands'])->keyBy('code');
    expect($byCode['junior']['count'])->toBe(1);
    expect($byCode['adult']['count'])->toBe(1);
    expect($byCode['master_1']['count'])->toBe(1);

    expect($payload['total'])->toBe(3);
    expect($payload['missing_dob'])->toBe(0);
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

it('rejects unauthenticated callers on age-bands endpoint', function (): void {
    $this->getJson('/api/v1/stats/athletes/age-bands')->assertUnauthorized();
});
