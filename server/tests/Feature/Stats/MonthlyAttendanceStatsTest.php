<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\AttendanceRecord;
use Carbon\CarbonImmutable;
use Laravel\Sanctum\Sanctum;

afterEach(function (): void {
    CarbonImmutable::setTestNow(null);
});

it('returns 12 monthly attendance buckets with count and training days', function (): void {
    $user = userWithAcademy();
    $active = Athlete::factory()->for($user->academy)->create(['status' => 'active']);
    $suspended = Athlete::factory()->for($user->academy)->create(['status' => 'suspended']);

    // Lock the test clock to a known month so the 12-month window is deterministic.
    $now = CarbonImmutable::create(2026, 5, 15);
    CarbonImmutable::setTestNow($now);

    // 3 active records on 3 distinct dates + 1 suspended record on a 4th distinct date.
    // Expected: attendance_count = 4, training_days = 4 (4 distinct dates in the month).
    AttendanceRecord::factory()->for($active)->on('2026-05-01')->create();
    AttendanceRecord::factory()->for($active)->on('2026-05-08')->create();
    AttendanceRecord::factory()->for($active)->on('2026-05-15')->create();
    AttendanceRecord::factory()->for($suspended)->on('2026-05-10')->create();

    // 2 active records in 2025-09 on 2 distinct dates (within the 12-month window).
    AttendanceRecord::factory()->for($active)->on('2025-09-04')->create();
    AttendanceRecord::factory()->for($active)->on('2025-09-18')->create();

    // 1 active record OUT of the 12-month window — must be excluded.
    AttendanceRecord::factory()->for($active)->on('2025-04-01')->create();

    Sanctum::actingAs($user);

    $response = $this->getJson('/api/v1/stats/attendance/monthly')->assertOk();
    $data = $response->json('data');

    expect($data)->toHaveCount(12);
    expect($data[11]['month'])->toBe('2026-05');
    // Total rows across active + suspended = 4.
    expect($data[11]['attendance_count'])->toBe(4);
    // 4 distinct dates: 2026-05-01, 2026-05-08, 2026-05-15, 2026-05-10.
    expect($data[11]['training_days'])->toBe(4);

    $sept = collect($data)->firstWhere('month', '2025-09');
    expect($sept)->not->toBeNull();
    expect($sept['attendance_count'])->toBe(2);
    expect($sept['training_days'])->toBe(2);

    // Window cutoff: 2025-04 is OLDER than the 12-month window, so the
    // earliest bucket is 2025-06 (May 2026 minus 11 months = June 2025).
    expect($data[0]['month'])->toBe('2025-06');
});

it('honours ?months= up to 24', function (): void {
    Sanctum::actingAs(userWithAcademy());

    $response = $this->getJson('/api/v1/stats/attendance/monthly?months=24')->assertOk();
    expect($response->json('data'))->toHaveCount(24);
});

it('rejects months outside [1, 24]', function (): void {
    Sanctum::actingAs(userWithAcademy());

    $this->getJson('/api/v1/stats/attendance/monthly?months=0')
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['months']);

    $this->getJson('/api/v1/stats/attendance/monthly?months=25')
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['months']);
});

it('isolates academies — academy A cannot see academy B counts', function (): void {
    $userA = userWithAcademy();
    $userB = userWithAcademy();
    $bobInB = Athlete::factory()->for($userB->academy)->create(['status' => 'active']);

    AttendanceRecord::factory()->for($bobInB)->on(CarbonImmutable::now()->toDateString())->create();

    Sanctum::actingAs($userA);
    $response = $this->getJson('/api/v1/stats/attendance/monthly')->assertOk();

    $totals = collect($response->json('data'))->sum(fn (array $row) => $row['attendance_count']);
    expect($totals)->toBe(0);
});

it('rejects unauthenticated callers', function (): void {
    $this->getJson('/api/v1/stats/attendance/monthly')->assertUnauthorized();
});
