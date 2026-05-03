<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\AttendanceRecord;
use Carbon\CarbonImmutable;
use Laravel\Sanctum\Sanctum;

afterEach(function (): void {
    CarbonImmutable::setTestNow(null);
});

it('returns 12 monthly attendance buckets split by athlete current status', function (): void {
    $user = userWithAcademy();
    $active = Athlete::factory()->for($user->academy)->create(['status' => 'active']);
    // The response key is "paused" and groups all non-active statuses
    // (suspended + inactive). Using 'suspended' here exercises that mapping.
    $suspended = Athlete::factory()->for($user->academy)->create(['status' => 'suspended']);

    // Lock the test clock to a known month so the 12-month window is deterministic.
    $now = CarbonImmutable::create(2026, 5, 15);
    CarbonImmutable::setTestNow($now);

    // 3 active records in current month, 1 suspended record same month.
    AttendanceRecord::factory()->for($active)->on('2026-05-01')->create();
    AttendanceRecord::factory()->for($active)->on('2026-05-08')->create();
    AttendanceRecord::factory()->for($active)->on('2026-05-15')->create();
    AttendanceRecord::factory()->for($suspended)->on('2026-05-10')->create();

    // 2 active records in 2025-09 (within the 12-month window).
    AttendanceRecord::factory()->for($active)->on('2025-09-04')->create();
    AttendanceRecord::factory()->for($active)->on('2025-09-18')->create();

    // 1 active record OUT of the 12-month window — must be excluded.
    AttendanceRecord::factory()->for($active)->on('2025-04-01')->create();

    Sanctum::actingAs($user);

    $response = $this->getJson('/api/v1/stats/attendance/monthly')->assertOk();
    $data = $response->json('data');

    expect($data)->toHaveCount(12);
    expect($data[11]['month'])->toBe('2026-05');
    expect($data[11]['active'])->toBe(3);
    expect($data[11]['paused'])->toBe(1);

    $sept = collect($data)->firstWhere('month', '2025-09');
    expect($sept)->not->toBeNull();
    expect($sept['active'])->toBe(2);
    expect($sept['paused'])->toBe(0);

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

    $totals = collect($response->json('data'))->sum(fn (array $row) => $row['active'] + $row['paused']);
    expect($totals)->toBe(0);
});

it('rejects unauthenticated callers', function (): void {
    $this->getJson('/api/v1/stats/attendance/monthly')->assertUnauthorized();
});
