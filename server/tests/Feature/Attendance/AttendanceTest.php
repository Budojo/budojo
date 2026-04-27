<?php

declare(strict_types=1);

use App\Models\Athlete;
use App\Models\AttendanceRecord;
use Carbon\Carbon;
use Laravel\Sanctum\Sanctum;

// Freeze the clock to a fixed moment for the whole file. The API's backfill
// window (`date` rule on POST /api/v1/attendance) is `[now() - 7 days,
// now()]`, so tests written with absolute dates like 2026-04-20 would
// eventually fall outside that rolling window as real time marched past
// May 2026 and the suite would flake on a calendar flip. Carbon::setTestNow
// pins every relative-time call in the code under test to 2026-04-24
// noon, which keeps the canonical 2026-04-20 test date a valid backfill
// (4 days before the frozen now) and the "7 days ago" / "8 days ago"
// boundary tests deterministic.
beforeEach(function (): void {
    Carbon::setTestNow(Carbon::parse('2026-04-24 12:00:00'));
});

afterEach(function (): void {
    Carbon::setTestNow();
});

// ─── POST /api/v1/attendance (bulk mark) ─────────────────────────────────────

it('marks multiple athletes present on a date in a single bulk call', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create();
    $luigi = Athlete::factory()->for($user->academy)->create();
    Sanctum::actingAs($user);

    $this->postJson('/api/v1/attendance', [
        'date' => '2026-04-20',
        'athlete_ids' => [$mario->id, $luigi->id],
    ])
        ->assertCreated()
        ->assertJsonStructure([
            'data' => [['id', 'athlete_id', 'attended_on']],
        ]);

    // whereDate over assertDatabaseHas: raw attribute match compares strings
    // and is brittle across DB engines (MySQL DATE vs SQLite TEXT). whereDate
    // compares only the date component and is portable.
    expect(
        AttendanceRecord::where('athlete_id', $mario->id)->whereDate('attended_on', '2026-04-20')->exists(),
    )->toBeTrue();
    expect(
        AttendanceRecord::where('athlete_id', $luigi->id)->whereDate('attended_on', '2026-04-20')->exists(),
    )->toBeTrue();
});

it('is idempotent: re-marking the same athlete on the same day is a no-op', function (): void {
    // PRD § P0.1 Given/When/Then — "the second request is treated as a no-op,
    // not a validation error." The instructor on the mat often double-taps;
    // the server must be forgiving.
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create();
    Sanctum::actingAs($user);

    $this->postJson('/api/v1/attendance', [
        'date' => '2026-04-20',
        'athlete_ids' => [$mario->id],
    ])->assertCreated();

    // Same payload a second time — should succeed AND not duplicate.
    $this->postJson('/api/v1/attendance', [
        'date' => '2026-04-20',
        'athlete_ids' => [$mario->id],
    ])->assertCreated();

    expect(
        AttendanceRecord::where('athlete_id', $mario->id)
            ->whereDate('attended_on', '2026-04-20')
            ->count(),
    )->toBe(1);
});

it('creates records only for new athletes when the bulk mixes new and already-present', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create();
    $luigi = Athlete::factory()->for($user->academy)->create();
    // Seed Mario as already present.
    AttendanceRecord::factory()->for($mario)->on('2026-04-20')->create();
    Sanctum::actingAs($user);

    $this->postJson('/api/v1/attendance', [
        'date' => '2026-04-20',
        'athlete_ids' => [$mario->id, $luigi->id],
    ])->assertCreated();

    // Mario still has exactly one record; Luigi has one new record.
    expect(AttendanceRecord::where('athlete_id', $mario->id)->count())->toBe(1);
    expect(AttendanceRecord::where('athlete_id', $luigi->id)->count())->toBe(1);
});

it('returns 403 when bulk-marking an athlete from another academy', function (): void {
    $ownerA = userWithAcademy();
    $ownerB = userWithAcademy();
    $athleteOfB = Athlete::factory()->for($ownerB->academy)->create();
    Sanctum::actingAs($ownerA);

    $this->postJson('/api/v1/attendance', [
        'date' => '2026-04-20',
        'athlete_ids' => [$athleteOfB->id],
    ])
        ->assertForbidden()
        ->assertExactJson(['message' => 'Forbidden.']);

    $this->assertDatabaseCount('attendance_records', 0);
});

it('returns 422 when the date is in the future', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create();
    Sanctum::actingAs($user);

    $this->postJson('/api/v1/attendance', [
        'date' => now()->addDay()->toDateString(),
        'athlete_ids' => [$mario->id],
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['date']);
});

it('accepts backfill up to 7 days in the past', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create();
    Sanctum::actingAs($user);

    $sevenDaysAgo = now()->subDays(7)->toDateString();

    $this->postJson('/api/v1/attendance', [
        'date' => $sevenDaysAgo,
        'athlete_ids' => [$mario->id],
    ])->assertCreated();
});

it('returns 422 when the date is beyond the 7-day backfill window', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create();
    Sanctum::actingAs($user);

    $this->postJson('/api/v1/attendance', [
        'date' => now()->subDays(8)->toDateString(),
        'athlete_ids' => [$mario->id],
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['date']);
});

it('returns 422 when athlete_ids is missing or empty', function (): void {
    $user = userWithAcademy();
    Sanctum::actingAs($user);

    $this->postJson('/api/v1/attendance', ['date' => '2026-04-20'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['athlete_ids']);

    $this->postJson('/api/v1/attendance', ['date' => '2026-04-20', 'athlete_ids' => []])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['athlete_ids']);
});

it('returns 401 when not authenticated', function (): void {
    $this->postJson('/api/v1/attendance', [
        'date' => '2026-04-20',
        'athlete_ids' => [1],
    ])->assertUnauthorized();
});

// Soft-delete restore: a mistakenly-tapped record can be corrected by
// deleting + re-creating on the same day. The partial-unique is enforced
// at the app layer, not the DB, so this test also guards the contract.
it('allows re-inserting for a day whose prior record was soft-deleted', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create();
    $previous = AttendanceRecord::factory()->for($mario)->on('2026-04-20')->create();
    $previous->delete(); // soft-delete

    Sanctum::actingAs($user);

    $this->postJson('/api/v1/attendance', [
        'date' => '2026-04-20',
        'athlete_ids' => [$mario->id],
    ])->assertCreated();

    expect(
        AttendanceRecord::where('athlete_id', $mario->id)
            ->whereDate('attended_on', '2026-04-20')
            ->count(),
    )->toBe(1); // the new active one

    expect(
        AttendanceRecord::withTrashed()
            ->where('athlete_id', $mario->id)
            ->whereDate('attended_on', '2026-04-20')
            ->count(),
    )->toBe(2); // tombstone + fresh active
});

// ─── GET /api/v1/attendance?date=... (daily cross-athlete list) ──────────────

it('lists athletes present on a given date for the authenticated academy', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create(['first_name' => 'Mario']);
    $luigi = Athlete::factory()->for($user->academy)->create(['first_name' => 'Luigi']);
    $absent = Athlete::factory()->for($user->academy)->create(['first_name' => 'Peach']);

    AttendanceRecord::factory()->for($mario)->on('2026-04-20')->create();
    AttendanceRecord::factory()->for($luigi)->on('2026-04-20')->create();
    AttendanceRecord::factory()->for($absent)->on('2026-04-19')->create(); // different day

    Sanctum::actingAs($user);

    $this->getJson('/api/v1/attendance?date=2026-04-20')
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonFragment(['athlete_id' => $mario->id])
        ->assertJsonFragment(['athlete_id' => $luigi->id])
        ->assertJsonMissing(['athlete_id' => $absent->id]);
});

it('defaults GET /attendance to today when no date is provided', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create();
    AttendanceRecord::factory()->for($mario)->on(now()->toDateString())->create();

    Sanctum::actingAs($user);

    $this->getJson('/api/v1/attendance')
        ->assertOk()
        ->assertJsonCount(1, 'data');
});

it('hides tombstones by default but exposes them with ?trashed=1', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create();
    $record = AttendanceRecord::factory()->for($mario)->on('2026-04-20')->create();
    $record->delete();

    Sanctum::actingAs($user);

    $this->getJson('/api/v1/attendance?date=2026-04-20')
        ->assertOk()
        ->assertJsonCount(0, 'data');

    $this->getJson('/api/v1/attendance?date=2026-04-20&trashed=1')
        ->assertOk()
        ->assertJsonCount(1, 'data');
});

it('never leaks attendance from another academy on the daily list', function (): void {
    $ownerA = userWithAcademy();
    $ownerB = userWithAcademy();
    $marioA = Athlete::factory()->for($ownerA->academy)->create();
    $marioB = Athlete::factory()->for($ownerB->academy)->create();
    AttendanceRecord::factory()->for($marioA)->on('2026-04-20')->create();
    AttendanceRecord::factory()->for($marioB)->on('2026-04-20')->create();

    Sanctum::actingAs($ownerA);

    $this->getJson('/api/v1/attendance?date=2026-04-20')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonFragment(['athlete_id' => $marioA->id])
        ->assertJsonMissing(['athlete_id' => $marioB->id]);
});

// ─── DELETE /api/v1/attendance/{id} ──────────────────────────────────────────

it('soft-deletes an attendance record owned by the academy', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create();
    $record = AttendanceRecord::factory()->for($mario)->create();

    Sanctum::actingAs($user);

    $this->deleteJson("/api/v1/attendance/{$record->id}")
        ->assertNoContent();

    expect(AttendanceRecord::find($record->id))->toBeNull();
    expect(AttendanceRecord::withTrashed()->find($record->id))->not->toBeNull();
});

it('returns 403 when deleting a record from another academy', function (): void {
    $ownerA = userWithAcademy();
    $ownerB = userWithAcademy();
    $athleteB = Athlete::factory()->for($ownerB->academy)->create();
    $recordB = AttendanceRecord::factory()->for($athleteB)->create();

    Sanctum::actingAs($ownerA);

    $this->deleteJson("/api/v1/attendance/{$recordB->id}")
        ->assertForbidden()
        ->assertExactJson(['message' => 'Forbidden.']);

    expect(AttendanceRecord::withTrashed()->find($recordB->id)->deleted_at)->toBeNull();
});

// ─── GET /api/v1/athletes/{athlete}/attendance (per-athlete history) ─────────

it('returns an athletes attendance history within a date window', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create();

    AttendanceRecord::factory()->for($mario)->on('2026-04-01')->create();
    AttendanceRecord::factory()->for($mario)->on('2026-04-15')->create();
    AttendanceRecord::factory()->for($mario)->on('2026-05-01')->create(); // outside window

    Sanctum::actingAs($user);

    $this->getJson("/api/v1/athletes/{$mario->id}/attendance?from=2026-04-01&to=2026-04-30")
        ->assertOk()
        ->assertJsonCount(2, 'data');
});

it('returns 403 for per-athlete history when the athlete is in another academy', function (): void {
    $ownerA = userWithAcademy();
    $ownerB = userWithAcademy();
    $athleteB = Athlete::factory()->for($ownerB->academy)->create();

    Sanctum::actingAs($ownerA);

    $this->getJson("/api/v1/athletes/{$athleteB->id}/attendance")
        ->assertForbidden()
        ->assertExactJson(['message' => 'Forbidden.']);
});

// ─── GET /api/v1/attendance/summary?month=... ────────────────────────────────

it('returns monthly summary with a count per athlete who trained that month', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create(['first_name' => 'Mario']);
    $luigi = Athlete::factory()->for($user->academy)->create(['first_name' => 'Luigi']);
    $nobody = Athlete::factory()->for($user->academy)->create(['first_name' => 'Peach']);

    // Mario trained 3 times in April.
    AttendanceRecord::factory()->for($mario)->on('2026-04-05')->create();
    AttendanceRecord::factory()->for($mario)->on('2026-04-12')->create();
    AttendanceRecord::factory()->for($mario)->on('2026-04-19')->create();
    // Luigi trained once.
    AttendanceRecord::factory()->for($luigi)->on('2026-04-10')->create();
    // Peach trained only in May — should NOT appear in the April summary.
    AttendanceRecord::factory()->for($nobody)->on('2026-05-01')->create();

    Sanctum::actingAs($user);

    $response = $this->getJson('/api/v1/attendance/summary?month=2026-04')->assertOk();

    $data = collect($response->json('data'));
    expect($data)->toHaveCount(2);

    $marioRow = $data->firstWhere('athlete_id', $mario->id);
    expect($marioRow['count'])->toBe(3);
    expect($marioRow['first_name'])->toBe('Mario');

    $luigiRow = $data->firstWhere('athlete_id', $luigi->id);
    expect($luigiRow['count'])->toBe(1);
});

it('excludes soft-deleted records from the monthly summary count', function (): void {
    $user = userWithAcademy();
    $mario = Athlete::factory()->for($user->academy)->create();

    AttendanceRecord::factory()->for($mario)->on('2026-04-05')->create();
    $cancelled = AttendanceRecord::factory()->for($mario)->on('2026-04-12')->create();
    $cancelled->delete();

    Sanctum::actingAs($user);

    $response = $this->getJson('/api/v1/attendance/summary?month=2026-04')->assertOk();

    $row = collect($response->json('data'))->firstWhere('athlete_id', $mario->id);
    expect($row['count'])->toBe(1);
});

it('returns 422 when the summary month is not in YYYY-MM format', function (): void {
    Sanctum::actingAs(userWithAcademy());

    $this->getJson('/api/v1/attendance/summary?month=not-a-date')
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['month']);

    $this->getJson('/api/v1/attendance/summary?month=2026-13')
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['month']);
});
