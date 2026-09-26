<?php

declare(strict_types=1);

use App\Models\Academy;
use App\Models\AcademySchedule;
use App\Support\ScheduledDays;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;

/**
 * #1764 — which days the academy was scheduled to train, from its schedule
 * history (#1094), ported from the client's `attendance-rate.ts`.
 */

/**
 * An unsaved academy with the given history, oldest first: the helper orders
 * the history itself rather than trusting the relation's order. The academy's
 * own `training_days` (today's snapshot) is deliberately a different day, so a
 * helper that read the column instead of the history would fail every test.
 *
 * @param  array<string, list<int>|null>  $rows  effective_from => training_days
 */
function academyWithHistory(array $rows): Academy
{
    $academy = new Academy(['training_days' => [6]]);
    $schedules = [];
    foreach ($rows as $from => $days) {
        $schedules[] = new AcademySchedule(['training_days' => $days, 'effective_from' => $from]);
    }
    $academy->setRelation('schedules', new Collection($schedules));

    return $academy;
}

/** Mon/Wed/Fri until 31 May, Tue/Thu from 1 June. */
function academyThatChangedInJune(): Academy
{
    return academyWithHistory([
        '2026-01-01' => [1, 3, 5],
        '2026-06-01' => [2, 4],
    ]);
}

function onDay(string $date): CarbonImmutable
{
    return CarbonImmutable::parse($date);
}

it('resolves each day against the schedule in force on that day', function (): void {
    $days = ScheduledDays::between(academyThatChangedInJune(), onDay('2026-05-25'), onDay('2026-06-05'), onDay('2026-07-01'));

    expect($days)->toBe(['2026-05-25', '2026-05-27', '2026-05-29', '2026-06-02', '2026-06-04']);
});

it('stops at today, today included', function (): void {
    $days = ScheduledDays::between(academyThatChangedInJune(), onDay('2026-06-01'), onDay('2026-06-30'), onDay('2026-06-04 18:30'));

    expect($days)->toBe(['2026-06-02', '2026-06-04']);
});

it('counts a window with no scheduled day yet as zero, not as unknown', function (): void {
    expect(ScheduledDays::countBetween(academyThatChangedInJune(), onDay('2026-09-01'), onDay('2026-09-30'), onDay('2026-07-01')))
        ->toBe(0)
        ->and(ScheduledDays::between(academyThatChangedInJune(), onDay('2026-09-01'), onDay('2026-09-30'), onDay('2026-07-01')))
        ->toBe([]);
});

it('says unknown when no schedule was ever configured', function (): void {
    $never = academyWithHistory(['2026-01-01' => null, '2026-03-01' => []]);
    $empty = academyWithHistory([]);

    expect(ScheduledDays::between($never, onDay('2026-03-02'), onDay('2026-03-31'), onDay('2026-07-01')))->toBeNull()
        ->and(ScheduledDays::countBetween($never, onDay('2026-03-02'), onDay('2026-03-31'), onDay('2026-07-01')))->toBeNull()
        ->and(ScheduledDays::countBetween($empty, onDay('2026-03-02'), onDay('2026-03-31'), onDay('2026-07-01')))->toBeNull();
});

it('schedules nothing before the history begins, nor under a not-configured row', function (): void {
    $academy = academyWithHistory([
        '2026-01-01' => [1, 3, 5],
        '2026-08-01' => null,
    ]);

    expect(ScheduledDays::isScheduledOn($academy, onDay('2025-12-29')))->toBeFalse()
        ->and(ScheduledDays::isScheduledOn($academy, onDay('2026-07-31')))->toBeTrue()
        ->and(ScheduledDays::isScheduledOn($academy, onDay('2026-08-03')))->toBeFalse();
});

it('walks back to the most recent scheduled days, never today', function (): void {
    // Wednesday 20 May: Mon 18, Fri 15, Wed 13 — and not the 20th itself.
    expect(ScheduledDays::lastBefore(academyThatChangedInJune(), onDay('2026-05-20'), 3))
        ->toBe(['2026-05-18', '2026-05-15', '2026-05-13']);
});

it('walks back across a schedule change with each side\'s own days', function (): void {
    // Wednesday 3 June: Tue 2 (the new schedule), Fri 29 and Wed 27 May (the old).
    expect(ScheduledDays::lastBefore(academyThatChangedInJune(), onDay('2026-06-03'), 3))
        ->toBe(['2026-06-02', '2026-05-29', '2026-05-27']);
});

it('returns fewer days than asked when the history is too short', function (): void {
    $new = academyWithHistory(['2026-05-18' => [1, 3, 5]]);

    expect(ScheduledDays::lastBefore($new, onDay('2026-05-21'), 3))->toBe(['2026-05-20', '2026-05-18'])
        ->and(ScheduledDays::lastBefore(academyWithHistory([]), onDay('2026-05-21'), 3))->toBe([]);
});
