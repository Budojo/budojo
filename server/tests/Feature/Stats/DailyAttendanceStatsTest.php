<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\User;
use Carbon\CarbonImmutable;
use Laravel\Sanctum\Sanctum;

afterEach(function (): void {
    CarbonImmutable::setTestNow(null);
});

it('returns daily counts in ascending order with correct shape, only populated days', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['status' => 'active']);

    CarbonImmutable::setTestNow('2026-05-15');

    // Two records on the same day → count 2 for that day.
    AttendanceRecord::factory()->for($athlete)->on('2026-05-01')->create();
    AttendanceRecord::factory()->for($athlete)->on('2026-05-01')->create();
    // One record on a different day within the 3-month window.
    AttendanceRecord::factory()->for($athlete)->on('2026-04-10')->create();
    // One record outside the 3-month window (> 3 months ago) — must be excluded.
    AttendanceRecord::factory()->for($athlete)->on('2026-02-14')->create();

    Sanctum::actingAs($user);

    $response = $this->getJson('/api/v1/stats/attendance/daily?months=3')->assertOk();
    $data = $response->json('data');

    // Only two populated days returned — the out-of-window day is excluded.
    expect($data)->toHaveCount(2);

    // Shape: {date: 'YYYY-MM-DD', count: int}.
    expect($data[0])->toMatchArray(['date' => '2026-04-10', 'count' => 1]);
    expect($data[1])->toMatchArray(['date' => '2026-05-01', 'count' => 2]);

    // No count:0 rows — sparse response.
    foreach ($data as $row) {
        expect($row['count'])->toBeGreaterThan(0);
    }
});

it('honours ?months=6 returning a wider window', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['status' => 'active']);

    CarbonImmutable::setTestNow('2026-05-15');

    // Within 6-month window.
    AttendanceRecord::factory()->for($athlete)->on('2025-12-01')->create();
    // Outside 6-month window — excluded.
    AttendanceRecord::factory()->for($athlete)->on('2025-10-31')->create();

    Sanctum::actingAs($user);

    $response = $this->getJson('/api/v1/stats/attendance/daily?months=6')->assertOk();
    $data = $response->json('data');

    expect($data)->toHaveCount(1);
    expect($data[0]['date'])->toBe('2025-12-01');
});

it('honours ?months=12', function (): void {
    $user = userWithAcademy();
    $athlete = Athlete::factory()->for($user->academy)->create(['status' => 'active']);

    CarbonImmutable::setTestNow('2026-05-15');

    // Within 12-month window.
    AttendanceRecord::factory()->for($athlete)->on('2025-06-01')->create();
    // Outside 12-month window — excluded.
    AttendanceRecord::factory()->for($athlete)->on('2025-05-14')->create();

    Sanctum::actingAs($user);

    $response = $this->getJson('/api/v1/stats/attendance/daily?months=12')->assertOk();
    $data = $response->json('data');

    expect($data)->toHaveCount(1);
    expect($data[0]['date'])->toBe('2025-06-01');
});

it('rejects ?months=4 — not in the {3, 6, 12} allow-list', function (): void {
    Sanctum::actingAs(userWithAcademy());

    $this->getJson('/api/v1/stats/attendance/daily?months=4')
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['months']);
});

it('rejects ?months=0 and ?months=24 — outside allow-list', function (): void {
    Sanctum::actingAs(userWithAcademy());

    $this->getJson('/api/v1/stats/attendance/daily?months=0')
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['months']);

    $this->getJson('/api/v1/stats/attendance/daily?months=24')
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['months']);
});

it('isolates academies — academy A cannot see academy B daily counts', function (): void {
    $userA = userWithAcademy();
    $userB = userWithAcademy();
    $athleteB = Athlete::factory()->for($userB->academy)->create(['status' => 'active']);

    CarbonImmutable::setTestNow('2026-05-15');
    AttendanceRecord::factory()->for($athleteB)->on('2026-05-10')->create();

    Sanctum::actingAs($userA);
    $response = $this->getJson('/api/v1/stats/attendance/daily')->assertOk();

    expect($response->json('data'))->toBeEmpty();
});

it('rejects unauthenticated callers', function (): void {
    $this->getJson('/api/v1/stats/attendance/daily')->assertUnauthorized();
});

it('returns 403 with structured JSON envelope when authed user has no academy', function (): void {
    // Authenticated but without an academy — DailyAttendanceRangeRequest::authorize()
    // returns false. The override on failedAuthorization() must produce a JSON
    // envelope (NOT Laravel's default HTML AuthorizationException page) so the
    // SPA's auth interceptor can key on the same wire shape every other
    // authenticated endpoint emits.
    Sanctum::actingAs(User::factory()->create());

    $this->getJson('/api/v1/stats/attendance/daily')
        ->assertForbidden()
        ->assertExactJson(['message' => 'Forbidden.']);
});
