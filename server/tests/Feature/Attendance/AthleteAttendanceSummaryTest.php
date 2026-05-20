<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\AttendanceRecord;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;

// Frozen clock keeps the N-day window deterministic across calendar flips.
// `today` resolves to 2026-05-20 for all assertions in this file. Window
// semantic is "the last N days" inclusive of both endpoints, so the
// 90d window spans 2026-02-20 → 2026-05-20 (range_start = today − 89d).
beforeEach(function (): void {
    Carbon::setTestNow(Carbon::parse('2026-05-20 12:00:00'));
});

afterEach(function (): void {
    Carbon::setTestNow();
});

// ─── GET /api/v1/athletes/{athlete}/attendance/summary ────────────────────────

it('returns rate over realized lesson days in the 90d window (happy path)', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()
        ->for($user->academy)
        ->create(['joined_at' => '2025-01-01']);
    $other = Athlete::factory()->for($user->academy)->create(['joined_at' => '2025-01-01']);

    // Four lesson days inside the 90d window. Each "lesson day" = any
    // attendance row exists on that date (any athlete in the academy).
    AttendanceRecord::factory()->for($mario)->create(['attended_on' => '2026-03-01']);
    AttendanceRecord::factory()->for($mario)->create(['attended_on' => '2026-03-15']);
    AttendanceRecord::factory()->for($mario)->create(['attended_on' => '2026-04-01']);
    // 2026-04-15 is a lesson day for `other` but Mario didn't show. Mario
    // gets the date in `expected_count` but NOT in `attended_count`.
    AttendanceRecord::factory()->for($other)->create(['attended_on' => '2026-04-15']);

    Sanctum::actingAs($user);

    $response = $this->getJson("/api/v1/athletes/{$mario->id}/attendance/summary?range=90");

    $response->assertOk()
        ->assertJson([
            'data' => [
                'range_days' => 90,
                'range_start' => '2026-02-20',
                'range_end' => '2026-05-20',
                'attended_count' => 3,
                'expected_count' => 4,
                'rate' => 0.75,
            ],
        ])
        ->assertJsonStructure([
            'data' => ['range_days', 'range_start', 'range_end', 'attended_count', 'expected_count', 'rate', 'series'],
        ]);

    // The series exposes one entry per realized lesson day, oldest first,
    // so the SPA can render a sparkline without a re-sort.
    $series = $response->json('data.series');
    expect($series)->toHaveCount(4);
    expect($series[0])->toMatchArray(['date' => '2026-03-01', 'attended' => true]);
    expect($series[3])->toMatchArray(['date' => '2026-04-15', 'attended' => false]);
});

it('defaults the range to 90 days when no query param is supplied', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create(['joined_at' => '2025-01-01']);
    Sanctum::actingAs($user);

    $this->getJson("/api/v1/athletes/{$mario->id}/attendance/summary")
        ->assertOk()
        ->assertJson(['data' => ['range_days' => 90]]);
});

it('clips the window at joined_at when the athlete joined mid-range', function (): void {
    $user = userWithAcademy();
    // Mario joined inside the window — anything before joined_at can't be
    // expected of him. A lesson day on 2026-03-01 that pre-dates his
    // joined_at (2026-04-01) must NOT inflate his expected_count.
    $mario = Athlete::factory()
        ->for($user->academy)
        ->create(['joined_at' => '2026-04-01']);
    $other = Athlete::factory()->for($user->academy)->create(['joined_at' => '2025-01-01']);

    AttendanceRecord::factory()->for($other)->create(['attended_on' => '2026-03-01']); // before joined_at
    AttendanceRecord::factory()->for($other)->create(['attended_on' => '2026-04-10']); // after — Mario didn't show
    AttendanceRecord::factory()->for($mario)->create(['attended_on' => '2026-04-20']); // Mario attended

    Sanctum::actingAs($user);

    $this->getJson("/api/v1/athletes/{$mario->id}/attendance/summary?range=90")
        ->assertOk()
        ->assertJson([
            'data' => [
                'attended_count' => 1,
                'expected_count' => 2, // 2026-04-10 + 2026-04-20 — NOT 2026-03-01
                'rate' => 0.5,
            ],
        ]);
});

it('returns rate=null and expected_count=0 when the academy held no lessons in the window', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create(['joined_at' => '2025-01-01']);
    // A lesson record OUTSIDE the 90d window — must not count.
    AttendanceRecord::factory()->for($mario)->create(['attended_on' => '2025-01-01']);

    Sanctum::actingAs($user);

    $this->getJson("/api/v1/athletes/{$mario->id}/attendance/summary?range=90")
        ->assertOk()
        ->assertJson([
            'data' => [
                'attended_count' => 0,
                'expected_count' => 0,
                'rate' => null,
                'series' => [],
            ],
        ]);
});

it('returns 404 when the athlete does not exist', function (): void {
    $user = userWithAcademy();
    Sanctum::actingAs($user);

    $this->getJson('/api/v1/athletes/9999/attendance/summary?range=90')->assertNotFound();
});

it('returns 403 when the athlete belongs to a different academy', function (): void {
    $ownerA = userWithAcademy();
    $ownerB = userWithAcademy();
    $foreignAthlete = Athlete::factory()->for($ownerB->academy)->create();
    Sanctum::actingAs($ownerA);

    $this->getJson("/api/v1/athletes/{$foreignAthlete->id}/attendance/summary?range=90")
        ->assertForbidden();
});

it('rejects an unsupported range value with 422', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create();
    Sanctum::actingAs($user);

    $this->getJson("/api/v1/athletes/{$mario->id}/attendance/summary?range=45")
        ->assertStatus(422)
        ->assertJsonValidationErrors(['range']);
});

it('accepts range=30 and range=365 (the other two supported values)', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create(['joined_at' => '2024-01-01']);
    Sanctum::actingAs($user);

    // range=30  → start = today − 29 days = 2026-04-21
    // range=365 → start = today − 364 days = 2025-05-21 (2024 was a leap year)
    $this->getJson("/api/v1/athletes/{$mario->id}/attendance/summary?range=30")
        ->assertOk()
        ->assertJson(['data' => ['range_days' => 30, 'range_start' => '2026-04-21']]);

    $this->getJson("/api/v1/athletes/{$mario->id}/attendance/summary?range=365")
        ->assertOk()
        ->assertJson(['data' => ['range_days' => 365, 'range_start' => '2025-05-21']]);
});

it('caches the response: a second call within the TTL does not re-query the DB', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create(['joined_at' => '2025-01-01']);
    AttendanceRecord::factory()->for($mario)->create(['attended_on' => '2026-04-01']);
    Sanctum::actingAs($user);

    Cache::flush();

    // First call — populates cache, hits DB.
    $this->getJson("/api/v1/athletes/{$mario->id}/attendance/summary?range=90")->assertOk();

    // Second call inside the TTL must serve from cache. Counter is reset
    // between calls so we measure only the second one.
    DB::enableQueryLog();
    DB::flushQueryLog();
    $this->getJson("/api/v1/athletes/{$mario->id}/attendance/summary?range=90")->assertOk();
    $queries = DB::getQueryLog();
    DB::disableQueryLog();

    // The auth/Sanctum lookup still runs (token → user → academy guard),
    // but no `attendance_records` query should fire. Filter to that table.
    $attendanceQueries = array_filter(
        $queries,
        static fn (array $q): bool => str_contains((string) $q['query'], 'attendance_records'),
    );
    expect($attendanceQueries)->toBeEmpty();
});

it('cache key segregates by athlete id and range so different windows do not collide', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create(['joined_at' => '2025-01-01']);
    AttendanceRecord::factory()->for($mario)->create(['attended_on' => '2026-04-01']);
    Sanctum::actingAs($user);

    Cache::flush();

    // 30d window misses 2026-04-01 (it falls outside 2026-04-20 → 2026-05-20)?
    // Actually 2026-04-01 IS inside the 30d window (start: 2026-04-20). So it
    // would NOT be included. Adjust expectations accordingly.
    $r30 = $this->getJson("/api/v1/athletes/{$mario->id}/attendance/summary?range=30")
        ->assertOk()
        ->json('data');
    $r90 = $this->getJson("/api/v1/athletes/{$mario->id}/attendance/summary?range=90")
        ->assertOk()
        ->json('data');

    // The 90d call must see the 2026-04-01 lesson; the 30d call must not.
    expect($r90['attended_count'])->toBe(1);
    expect($r30['attended_count'])->toBe(0);
});
