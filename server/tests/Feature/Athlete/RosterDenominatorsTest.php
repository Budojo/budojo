<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use Carbon\CarbonImmutable;

/**
 * #1768 — the roster's Sessions fractions divide by server denominators: the
 * two halves of the most-read attendance number come from one machine.
 *
 * Mon/Wed/Fri from 1 January; today Friday 15 May 2026, in the season that
 * began in September. May so far: 1, 4, 6, 8, 11, 13, 15 — seven sessions.
 * The season, from the first schedule row: 58; from 2 March: 33.
 */
beforeEach(function (): void {
    $this->owner = userWithAcademy();
    /** @var Academy $academy */
    $academy = $this->owner->academy;
    $this->academy = $academy;
    $this->academy->schedules()->create(['training_days' => [1, 3, 5], 'effective_from' => '2026-01-01']);
    $this->travelTo(CarbonImmutable::parse('2026-05-15 12:00'));
});

/** @return array<int, array<string, mixed>> */
function rosterRows(object $test): array
{
    return collect($test->actingAs($test->owner)->getJson('/api/v1/athletes')->assertOk()->json('data'))
        ->keyBy('id')
        ->all();
}

it('floors the season at the day each athlete joined, on the same page', function (): void {
    $founder = Athlete::factory()->for($this->academy)->create(['joined_at' => '2025-06-01']);
    $newcomer = Athlete::factory()->for($this->academy)->create(['joined_at' => '2026-03-02']);

    $rows = rosterRows($this);

    expect($rows[$founder->id]['attendance_season_expected'])->toBe(58)
        ->and($rows[$newcomer->id]['attendance_season_expected'])->toBe(33)
        ->and($rows[$founder->id]['attendance_month_expected'])->toBe(7)
        ->and($rows[$newcomer->id]['attendance_month_expected'])->toBe(7);
});

it('starts the month at the first presence when it comes before the joining day, as the summary does', function (): void {
    // A trial on Monday 4 May, registered on the 11th: the month counts from the 4th.
    $trial = Athlete::factory()->for($this->academy)->create(['joined_at' => '2026-05-11']);
    AttendanceRecord::factory()->for($trial)->on('2026-05-04')->create();

    expect(rosterRows($this)[$trial->id]['attendance_month_expected'])->toBe(6);
});

it('leaves the days the academy was closed out of both', function (): void {
    $athlete = Athlete::factory()->for($this->academy)->create(['joined_at' => '2025-06-01']);
    $this->academy->closures()->create(['starts_on' => '2026-05-06', 'ends_on' => '2026-05-08']);

    $row = rosterRows($this)[$athlete->id];

    expect($row['attendance_month_expected'])->toBe(5)
        ->and($row['attendance_season_expected'])->toBe(56);
});

it('sends null, not zero, when no schedule was ever configured', function (): void {
    $this->academy->schedules()->delete();
    $athlete = Athlete::factory()->for($this->academy)->create(['joined_at' => '2025-06-01']);

    $row = rosterRows($this)[$athlete->id];

    expect($row)->toHaveKey('attendance_month_expected')
        ->and($row['attendance_month_expected'])->toBeNull()
        ->and($row['attendance_season_expected'])->toBeNull();
});

it('says nothing about denominators where it did not work them out', function (): void {
    $athlete = Athlete::factory()->for($this->academy)->create(['joined_at' => '2025-06-01']);

    $row = $this->actingAs($this->owner)->getJson("/api/v1/athletes/{$athlete->id}")->assertOk()->json('data');

    expect($row)->not->toHaveKey('attendance_month_expected')
        ->and($row)->not->toHaveKey('attendance_season_expected');
});
