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
//
// The denominator is the days the academy was SCHEDULED to train (#1769),
// closures out: Mon/Wed/Fri from 1 January here. Today is Wednesday 20 May.
// The 30-day window (21 April – 20 May) holds 13 sessions, the 90-day one
// (20 February – 20 May) 39.

/** An academy that trains Mon/Wed/Fri since 1 January, and its owner. */
function summaryAcademyOwner(): App\Models\User
{
    $user = userWithAcademy();
    $user->academy->schedules()->create(['training_days' => [1, 3, 5], 'effective_from' => '2026-01-01']);

    return $user;
}

function summaryOf(object $test, Athlete $athlete, string $query): array
{
    return $test->getJson("/api/v1/athletes/{$athlete->id}/attendance/summary?{$query}")->assertOk()->json('data');
}

it('divides by the days the academy was scheduled to train, one series entry per session', function (): void {
    $user = summaryAcademyOwner();
    $mario = Athlete::factory()->for($user->academy)->create(['joined_at' => '2025-01-01']);
    foreach (['2026-03-02', '2026-03-16', '2026-04-01'] as $day) {
        AttendanceRecord::factory()->for($mario)->create(['attended_on' => $day]);
    }
    Sanctum::actingAs($user);

    $data = summaryOf($this, $mario, 'range=90');

    expect($data)->toMatchArray([
        'range_days' => 90,
        'range_start' => '2026-02-20',
        'range_end' => '2026-05-20',
        'attended_count' => 3,
        'expected_count' => 39,
        'rate' => round(3 / 39, 4),
    ])
        ->and($data['series'])->toHaveCount(39)
        ->and($data['series'][0])->toBe(['date' => '2026-02-20', 'attended' => false])
        ->and(collect($data['series'])->where('attended', true)->pluck('date')->all())
        ->toBe(['2026-03-02', '2026-03-16', '2026-04-01']);
});

it('does not move anyone\'s denominator when someone else trains on a Sunday', function (): void {
    // The case that proves #1769: under "days anyone trained", one open mat
    // added a day every other athlete had missed.
    $user = summaryAcademyOwner();
    $a = Athlete::factory()->for($user->academy)->create(['joined_at' => '2025-01-01']);
    $b = Athlete::factory()->for($user->academy)->create(['joined_at' => '2025-01-01']);
    Sanctum::actingAs($user);
    $before = summaryOf($this, $b, 'range=30')['expected_count'];

    AttendanceRecord::factory()->for($a)->create(['attended_on' => '2026-05-17']); // Sunday
    Cache::flush();

    expect(summaryOf($this, $b, 'range=30')['expected_count'])->toBe($before)->toBe(13);
});

it('counts an off-schedule session for the athlete who trained, past 100% if so', function (): void {
    $user = summaryAcademyOwner();
    $mario = Athlete::factory()->for($user->academy)->create(['joined_at' => '2025-01-01']);
    foreach (['2026-04-22', '2026-04-24', '2026-04-27', '2026-04-29', '2026-05-01', '2026-05-04', '2026-05-06',
        '2026-05-08', '2026-05-11', '2026-05-13', '2026-05-15', '2026-05-18', '2026-05-20', '2026-05-17'] as $day) {
        AttendanceRecord::factory()->for($mario)->create(['attended_on' => $day]);
    }
    Sanctum::actingAs($user);

    $data = summaryOf($this, $mario, 'range=30');

    // Never clamped: the ring renders past 100% on purpose.
    expect($data['attended_count'])->toBe(14)
        ->and($data['expected_count'])->toBe(13)
        ->and($data['rate'])->toBe(round(14 / 13, 4))
        ->and(collect($data['series'])->firstWhere('date', '2026-05-17'))->toBe(['date' => '2026-05-17', 'attended' => true]);
});

it('clips the window at joined_at when the athlete joined mid-range', function (): void {
    $user = summaryAcademyOwner();
    $mario = Athlete::factory()->for($user->academy)->create(['joined_at' => '2026-04-01']);
    AttendanceRecord::factory()->for($mario)->create(['attended_on' => '2026-04-20']);
    Sanctum::actingAs($user);

    // Mon/Wed/Fri from 1 April to 20 May: 22 sessions.
    expect(summaryOf($this, $mario, 'range=90'))->toMatchArray(['attended_count' => 1, 'expected_count' => 22]);
});

it('starts at the first presence when it came before the joining day, as every screen does', function (): void {
    // Trial sessions on 27 and 29 April, registered on 11 May.
    $user = summaryAcademyOwner();
    $trial = Athlete::factory()->for($user->academy)->create(['joined_at' => '2026-05-11']);
    foreach (['2026-04-27', '2026-04-29', '2026-05-13'] as $day) {
        AttendanceRecord::factory()->for($trial)->create(['attended_on' => $day]);
    }
    Sanctum::actingAs($user);

    // From 27 April: 27, 29, 1, 4, 6, 8, 11, 13, 15, 18, 20.
    expect(summaryOf($this, $trial, 'range=30'))->toMatchArray([
        'window_start' => '2026-04-27',
        'attended_count' => 3,
        'expected_count' => 11,
    ]);
});

it('leaves a closure out, which raises the rate of someone who came to everything else', function (): void {
    $user = summaryAcademyOwner();
    $mario = Athlete::factory()->for($user->academy)->create(['joined_at' => '2025-01-01']);
    AttendanceRecord::factory()->for($mario)->create(['attended_on' => '2026-05-11']);
    $user->academy->closures()->create(['starts_on' => '2026-05-04', 'ends_on' => '2026-05-08']);
    Sanctum::actingAs($user);

    expect(summaryOf($this, $mario, 'range=30'))->toMatchArray(['expected_count' => 10, 'rate' => 0.1]);
});

it('sends a null denominator when no schedule was ever configured', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create(['joined_at' => '2025-01-01']);
    AttendanceRecord::factory()->for($mario)->create(['attended_on' => '2026-05-11']);
    Sanctum::actingAs($user);

    expect(summaryOf($this, $mario, 'range=30'))->toMatchArray([
        'attended_count' => 1,
        'expected_count' => null,
        'rate' => null,
    ]);
});

it('answers a calendar month for the ring, stopping at today', function (): void {
    $user = summaryAcademyOwner();
    $mario = Athlete::factory()->for($user->academy)->create(['joined_at' => '2025-01-01']);
    AttendanceRecord::factory()->for($mario)->create(['attended_on' => '2026-04-01']);
    AttendanceRecord::factory()->for($mario)->create(['attended_on' => '2026-05-04']);
    Sanctum::actingAs($user);

    expect(summaryOf($this, $mario, 'month=2026-04'))->toMatchArray([
        'range_days' => 30,
        'range_start' => '2026-04-01',
        'range_end' => '2026-04-30',
        'window_start' => '2026-04-01',
        'attended_count' => 1,
        'expected_count' => 13,
    ])
        ->and(summaryOf($this, $mario, 'month=2026-05'))->toMatchArray([
            'range_days' => 31,
            'range_start' => '2026-05-01',
            'range_end' => '2026-05-31',
            'attended_count' => 1,
            'expected_count' => 9,
        ]);
});

it('refuses a malformed month, and a month and a range together', function (): void {
    $user = summaryAcademyOwner();
    $mario = Athlete::factory()->for($user->academy)->create();
    Sanctum::actingAs($user);

    $this->getJson("/api/v1/athletes/{$mario->id}/attendance/summary?month=2026-13")
        ->assertStatus(422)->assertJsonValidationErrors(['month']);
    $this->getJson("/api/v1/athletes/{$mario->id}/attendance/summary?month=2026-04&range=30")
        ->assertStatus(422)->assertJsonValidationErrors(['month']);
});

it('forgets the cached answers when a closure changes', function (): void {
    $user = summaryAcademyOwner();
    $mario = Athlete::factory()->for($user->academy)->create(['joined_at' => '2025-01-01']);
    Sanctum::actingAs($user);
    Cache::flush();
    expect(summaryOf($this, $mario, 'month=2026-05')['expected_count'])->toBe(9);

    $this->postJson('/api/v1/academy/closures', ['starts_on' => '2026-05-04', 'ends_on' => '2026-05-08'])->assertCreated();

    expect(summaryOf($this, $mario, 'month=2026-05')['expected_count'])->toBe(6);
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

    // A month is its own window, with its own key (#1769).
    $april = $this->getJson("/api/v1/athletes/{$mario->id}/attendance/summary?month=2026-04")
        ->assertOk()
        ->json('data');
    expect($april['range_start'])->toBe('2026-04-01')
        ->and($april['attended_count'])->toBe(1);
});

it('forgets the cached answers when a presence is marked', function (): void {
    // The calendar showed a tick made on the check-in page at once, and the
    // ring five minutes later.
    $user = summaryAcademyOwner();
    $mario = Athlete::factory()->for($user->academy)->create(['joined_at' => '2025-01-01']);
    Sanctum::actingAs($user);
    Cache::flush();
    expect(summaryOf($this, $mario, 'month=2026-05')['attended_count'])->toBe(0);

    AttendanceRecord::factory()->for($mario)->create(['attended_on' => '2026-05-18']);

    expect(summaryOf($this, $mario, 'month=2026-05')['attended_count'])->toBe(1);
});

it('forgets the cached answers when the training days change, twice on the same day', function (): void {
    // The second change of a day updates the schedule row through the query
    // builder, which fires no model event (RecordTrainingDaysAction).
    $user = summaryAcademyOwner();
    $mario = Athlete::factory()->for($user->academy)->create(['joined_at' => '2025-01-01']);
    Sanctum::actingAs($user);
    Cache::flush();
    expect(summaryOf($this, $mario, 'month=2026-05')['expected_count'])->toBe(9);

    // Today is Wednesday the 20th: dropping Wednesday from today on takes
    // today out of May (8); putting it back, the same day, updates that row.
    $this->patchJson('/api/v1/academy', ['training_days' => [1, 5]])->assertOk();
    expect(summaryOf($this, $mario, 'month=2026-05')['expected_count'])->toBe(8);

    $this->patchJson('/api/v1/academy', ['training_days' => [1, 3, 5]])->assertOk();
    expect(summaryOf($this, $mario, 'month=2026-05')['expected_count'])->toBe(9);
});
