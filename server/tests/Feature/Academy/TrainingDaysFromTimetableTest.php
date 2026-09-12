<?php

declare(strict_types=1);

use App\Models\AcademyClass;
use App\Models\AcademySchedule;
use Illuminate\Support\Carbon;

/**
 * The training days follow the timetable (#1575).
 *
 * Since #1562 an academy said when it trains in two places, and nothing tied
 * them together. While the timetable has classes, the weekday pills are
 * derived from it — through the same path the owner's PATCH uses, so the
 * schedule history keeps its row and the past keeps its denominators.
 */

// helpers live in tests/Pest.php

beforeEach(function (): void {
    Carbon::setTestNow(Carbon::parse('2026-09-14 18:30:00')); // a Monday
    $this->user = userWithAcademy();
    $this->academy = $this->user->academy;
    $this->academy->update(['training_days' => [2, 4]]); // Tue / Thu, set by hand
});

afterEach(function (): void {
    Carbon::setTestNow();
});

/** @return list<int>|null */
function daysOf(mixed $test): ?array
{
    return $test->academy->fresh()->training_days;
}

it('follows the first class onto the timetable', function (): void {
    $this->actingAs($this->user)
        ->postJson('/api/v1/academy/classes', ['name' => 'Fundamentals', 'weekday' => 1, 'kind' => 'gi'])
        ->assertCreated();

    expect(daysOf($this))->toBe([1]);
});

it('collects every day that has a class, ascending, once', function (): void {
    AcademyClass::factory()->for($this->academy)->create(['weekday' => 5]);
    AcademyClass::factory()->for($this->academy)->create(['weekday' => 1]);
    AcademyClass::factory()->for($this->academy)->create(['weekday' => 1, 'starts_at' => '20:30']);

    expect(daysOf($this))->toBe([1, 5]);
});

it('moves with a class that changes day', function (): void {
    $class = AcademyClass::factory()->for($this->academy)->create(['weekday' => 1]);

    $this->actingAs($this->user)
        ->patchJson("/api/v1/academy/classes/{$class->id}", ['weekday' => 3])
        ->assertOk();

    expect(daysOf($this))->toBe([3]);
});

it('drops a day when its last class is removed, and keeps the rest', function (): void {
    $monday = AcademyClass::factory()->for($this->academy)->create(['weekday' => 1]);
    AcademyClass::factory()->for($this->academy)->create(['weekday' => 3]);

    $this->actingAs($this->user)->deleteJson("/api/v1/academy/classes/{$monday->id}")->assertNoContent();

    expect(daysOf($this))->toBe([3]);
});

it('leaves the days where they were when the whole timetable is taken down', function (): void {
    // A timetable removed is not a claim that nobody trains. The owner gets
    // the pills back, showing the last schedule the classes had.
    $only = AcademyClass::factory()->for($this->academy)->create(['weekday' => 1]);
    expect(daysOf($this))->toBe([1]);

    $this->actingAs($this->user)->deleteJson("/api/v1/academy/classes/{$only->id}")->assertNoContent();

    expect(daysOf($this))->toBe([1]);
});

it('leaves an academy with no timetable entirely alone', function (): void {
    // Nothing happened on the timetable, so nothing happens to the pills —
    // and no "schedule starting today" row appears out of nowhere.
    expect(daysOf($this))->toBe([2, 4]);
    expect(
        AcademySchedule::where('academy_id', $this->academy->id)
            ->where('effective_from', '2026-09-14')
            ->exists(),
    )->toBeFalse();
});

it('writes the schedule history like a PATCH would — one row for today, updated on a same-day change', function (): void {
    AcademyClass::factory()->for($this->academy)->create(['weekday' => 1]);
    AcademyClass::factory()->for($this->academy)->create(['weekday' => 3]);

    $today = AcademySchedule::where('academy_id', $this->academy->id)
        ->where('effective_from', '2026-09-14')
        ->get();

    expect($today)->toHaveCount(1)
        ->and($today->first()?->training_days)->toBe([1, 3]);

    // And the past is untouched: nothing was in force on 1 September (the
    // factory academy has no seed row) and nothing has been written there,
    // so the expected-attendance denominators of the past do not move.
    expect($this->academy->scheduleForDate(Carbon::parse('2026-09-01')))->toBeNull();
});

it('does not touch the history when the days did not change', function (): void {
    AcademyClass::factory()->for($this->academy)->create(['weekday' => 1]);
    $rows = AcademySchedule::where('academy_id', $this->academy->id)->count();

    // A second Monday class changes the timetable, not the days.
    AcademyClass::factory()->for($this->academy)->create(['weekday' => 1, 'starts_at' => '20:30']);

    expect(AcademySchedule::where('academy_id', $this->academy->id)->count())->toBe($rows);
});

it('refuses hand-set training days while the timetable has classes', function (): void {
    AcademyClass::factory()->for($this->academy)->create(['weekday' => 1]);

    $this->actingAs($this->user)
        ->patchJson('/api/v1/academy', ['training_days' => [2, 4]])
        ->assertStatus(422)
        ->assertJsonValidationErrors('training_days');

    expect(daysOf($this))->toBe([1]);
});

it('still accepts hand-set training days when there is no timetable', function (): void {
    $this->actingAs($this->user)
        ->patchJson('/api/v1/academy', ['training_days' => [1, 3, 5]])
        ->assertOk()
        ->assertJsonPath('data.training_days', [1, 3, 5]);
});

it('keeps the other academy fields editable while the days are derived', function (): void {
    AcademyClass::factory()->for($this->academy)->create(['weekday' => 1]);

    $this->actingAs($this->user)
        ->patchJson('/api/v1/academy', ['name' => 'Renamed Academy'])
        ->assertOk()
        ->assertJsonPath('data.name', 'Renamed Academy')
        ->assertJsonPath('data.training_days', [1]);
});
