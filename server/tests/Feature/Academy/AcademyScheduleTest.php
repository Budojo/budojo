<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\AcademySchedule;
use App\Models\User;
use Illuminate\Support\Carbon;
use Laravel\Sanctum\Sanctum;

/*
 * Schedule history (#1094) — the data-model behind correct historical
 * attendance percentages when the owner changes the weekly schedule.
 *
 * Three things must be true across these tests:
 *   1. Brand-new academies seed one history row at create-time.
 *   2. PATCH /academy with `training_days` inserts a row at
 *      `effective_from = today` (idempotent on same-day re-PATCH).
 *   3. `scheduleForDate()` returns the row with the largest
 *      `effective_from <= $date` — the "in-effect-on" lookup.
 */

// `Carbon::setTestNow` is process-global and persists across PEST tests
// in the same parallel worker — leave it set and the next sibling test
// resolves `Carbon::today()` against the pinned date, producing flaky
// false negatives. Reset after every test in this file.
afterEach(function (): void {
    Carbon::setTestNow();
});

// ─── Model helpers ───────────────────────────────────────────────────────────

it('scheduleForDate returns the row with the largest effective_from <= date', function (): void {
    $academy = Academy::factory()->create(['training_days' => [1, 3, 5]]);
    // Wipe the seed row created by the factory's create observer (if any)
    // so the test owns the schedule timeline fully.
    $academy->schedules()->delete();

    $academy->schedules()->createMany([
        ['training_days' => [1, 3, 5], 'effective_from' => '2026-01-01'],
        ['training_days' => [2, 4],    'effective_from' => '2026-06-01'],
        ['training_days' => [0, 6],    'effective_from' => '2026-12-01'],
    ]);

    // Exact match — Jun 1 returns the Jun 1 row.
    expect($academy->scheduleForDate(Carbon::parse('2026-06-01'))?->training_days)
        ->toBe([2, 4]);

    // Between rows — May 31 still sees the Jan 1 schedule.
    expect($academy->scheduleForDate(Carbon::parse('2026-05-31'))?->training_days)
        ->toBe([1, 3, 5]);

    // After last row — Dec 25 sees the Dec 1 schedule.
    expect($academy->scheduleForDate(Carbon::parse('2026-12-25'))?->training_days)
        ->toBe([0, 6]);

    // Before the first row — no covering schedule, returns null.
    expect($academy->scheduleForDate(Carbon::parse('2025-12-31')))->toBeNull();
});

it('currentSchedule returns the schedule effective today', function (): void {
    Carbon::setTestNow('2026-06-15');
    $academy = Academy::factory()->create();
    $academy->schedules()->delete();
    $academy->schedules()->createMany([
        ['training_days' => [1, 3, 5], 'effective_from' => '2026-01-01'],
        ['training_days' => [2, 4],    'effective_from' => '2026-06-01'],
    ]);

    expect($academy->currentSchedule()?->training_days)->toBe([2, 4]);
});

it('nextSchedule returns the soonest pending future row', function (): void {
    Carbon::setTestNow('2026-05-28');
    $academy = Academy::factory()->create();
    $academy->schedules()->delete();
    $academy->schedules()->createMany([
        ['training_days' => [1, 3, 5], 'effective_from' => '2026-01-01'],
        ['training_days' => [2, 4],    'effective_from' => '2026-06-01'],
    ]);

    expect($academy->nextSchedule()?->effective_from->toDateString())
        ->toBe('2026-06-01');
});

it('nextSchedule is null when no future row exists', function (): void {
    Carbon::setTestNow('2026-12-31');
    $academy = Academy::factory()->create();
    $academy->schedules()->delete();
    $academy->schedules()->create([
        'training_days' => [1, 3, 5],
        'effective_from' => '2026-01-01',
    ]);

    expect($academy->nextSchedule())->toBeNull();
});

it('today-row counts as current, not next (boundary)', function (): void {
    // The `nextSchedule()` query is `effective_from > today` strictly,
    // so a row dated today is the current schedule, not the next.
    Carbon::setTestNow('2026-06-01');
    $academy = Academy::factory()->create();
    $academy->schedules()->delete();
    $academy->schedules()->createMany([
        ['training_days' => [1, 3, 5], 'effective_from' => '2026-01-01'],
        ['training_days' => [2, 4],    'effective_from' => '2026-06-01'],
    ]);

    expect($academy->currentSchedule()?->training_days)->toBe([2, 4]);
    expect($academy->nextSchedule())->toBeNull();
});

// ─── Create-time seed row ────────────────────────────────────────────────────

it('seeds one schedule row on POST /academy (with training_days)', function (): void {
    Carbon::setTestNow('2026-05-28');
    Sanctum::actingAs(User::factory()->create());

    $this->postJson('/api/v1/academy', [
        'name' => 'Schedule History Roma',
        'training_days' => [1, 3, 5],
    ])->assertCreated();

    $academy = Academy::firstOrFail();
    expect($academy->schedules()->count())->toBe(1);
    $row = $academy->schedules()->first();
    expect($row?->training_days)->toBe([1, 3, 5]);
    expect($row?->effective_from->toDateString())->toBe('2026-05-28');
});

it('seeds one schedule row on POST /academy even when training_days is omitted (null carries through)', function (): void {
    Carbon::setTestNow('2026-05-28');
    Sanctum::actingAs(User::factory()->create());

    $this->postJson('/api/v1/academy', ['name' => 'No-schedule Academy'])
        ->assertCreated();

    $academy = Academy::firstOrFail();
    expect($academy->schedules()->count())->toBe(1);
    expect($academy->schedules()->first()?->training_days)->toBeNull();
});

// ─── PATCH /academy schedule-history semantics ───────────────────────────────

it('PATCH training_days inserts a new history row at today instead of mutating the past', function (): void {
    Carbon::setTestNow('2026-05-15');
    $user = User::factory()->create();
    Academy::factory()->create([
        'user_id' => $user->id,
        'training_days' => [2, 4],
    ]);
    Sanctum::actingAs($user);

    $academy = $user->activeAcademy();
    expect($academy)->not->toBeNull();
    $academy->schedules()->delete();
    $academy->schedules()->create([
        'training_days' => [2, 4],
        'effective_from' => '2026-01-01',
    ]);

    $this->patchJson('/api/v1/academy', ['training_days' => [1, 3, 5]])
        ->assertOk()
        ->assertJsonPath('data.training_days', [1, 3, 5]);

    expect($academy->schedules()->count())->toBe(2);
    expect($academy->scheduleForDate(Carbon::parse('2026-04-01'))?->training_days)
        ->toBe([2, 4]);
    expect($academy->scheduleForDate(Carbon::parse('2026-05-15'))?->training_days)
        ->toBe([1, 3, 5]);
});

it('PATCH training_days twice in the same day replaces the today row (no UNIQUE violation)', function (): void {
    Carbon::setTestNow('2026-05-15');
    $user = User::factory()->create();
    Academy::factory()->create(['user_id' => $user->id]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['training_days' => [2, 4]])->assertOk();
    $this->patchJson('/api/v1/academy', ['training_days' => [1, 3, 5]])->assertOk();

    /** @var Academy $academy */
    $academy = $user->activeAcademy();
    expect(AcademySchedule::where('academy_id', $academy->id)
        ->whereDate('effective_from', '2026-05-15')
        ->count())->toBe(1);
    expect($academy->currentSchedule()?->training_days)->toBe([1, 3, 5]);
});

it('PATCH training_days = null inserts a null-schedule history row', function (): void {
    Carbon::setTestNow('2026-05-15');
    $user = User::factory()->create();
    Academy::factory()->create([
        'user_id' => $user->id,
        'training_days' => [2, 4],
    ]);
    Sanctum::actingAs($user);

    $this->patchJson('/api/v1/academy', ['training_days' => null])->assertOk();

    /** @var Academy $academy */
    $academy = $user->activeAcademy();
    expect($academy->currentSchedule()?->training_days)->toBeNull();
});

it('PATCH that does not include training_days leaves the schedule history untouched', function (): void {
    Carbon::setTestNow('2026-05-15');
    $user = User::factory()->create();
    Academy::factory()->create([
        'user_id' => $user->id,
        'training_days' => [2, 4],
    ]);
    Sanctum::actingAs($user);

    /** @var Academy $academy */
    $academy = $user->activeAcademy();
    $beforeCount = $academy->schedules()->count();

    $this->patchJson('/api/v1/academy', ['name' => 'Renamed'])->assertOk();

    expect($academy->fresh()?->schedules()->count())->toBe($beforeCount);
});

// ─── GET /academy resource shape ─────────────────────────────────────────────

it('GET /academy exposes current_schedule, next_schedule, and schedules history', function (): void {
    Carbon::setTestNow('2026-05-15');
    $user = User::factory()->create();
    $academy = Academy::factory()->create([
        'user_id' => $user->id,
        'training_days' => [2, 4],
    ]);
    Sanctum::actingAs($user);

    // Replace the create-time seed with a pinned timeline so the test's
    // assertions are deterministic against fixed dates.
    $academy->schedules()->delete();
    $academy->schedules()->createMany([
        ['training_days' => [2, 4],    'effective_from' => '2026-01-01'],
        ['training_days' => [1, 3, 5], 'effective_from' => '2026-06-01'],
    ]);

    $this->getJson('/api/v1/academy')
        ->assertOk()
        ->assertJsonPath('data.current_schedule.training_days', [2, 4])
        ->assertJsonPath('data.current_schedule.effective_from', '2026-01-01')
        ->assertJsonPath('data.next_schedule.training_days', [1, 3, 5])
        ->assertJsonPath('data.next_schedule.effective_from', '2026-06-01')
        // History is ordered most-recent-first so a paginating/limiting
        // FE consumer can drop later rows without losing the "now" row.
        ->assertJsonPath('data.schedules.0.effective_from', '2026-06-01')
        ->assertJsonPath('data.schedules.1.effective_from', '2026-01-01');
});

it('GET /academy returns next_schedule = null when no future row is pending', function (): void {
    Carbon::setTestNow('2026-06-15');
    $user = User::factory()->create();
    $academy = Academy::factory()->create(['user_id' => $user->id]);
    $academy->schedules()->delete();
    $academy->schedules()->create([
        'training_days' => [1, 3, 5],
        'effective_from' => '2026-01-01',
    ]);
    Sanctum::actingAs($user);

    $this->getJson('/api/v1/academy')
        ->assertOk()
        ->assertJsonPath('data.next_schedule', null);
});
