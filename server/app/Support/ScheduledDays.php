<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Academy;
use App\Models\AcademySchedule;
use Carbon\CarbonImmutable;

/**
 * Which days the academy was scheduled to train (#1764): the denominator of
 * every attendance rate, and the days the missed-streak alert walks.
 *
 * The rule used to live only in the SPA (`attendance-rate.ts`), so no server
 * reader could use it and the one that needed it improvised a copy. It is
 * ported here with its three rules, each of which was a bug once:
 *
 * - **Each day against the schedule in force on THAT day** (#1094). A window
 *   spanning a timetable change yields each segment's own days; reading
 *   `academies.training_days` (today's snapshot) would rewrite the past.
 * - **Null is not zero.** Null means no schedule was configured anywhere in
 *   the history, and the caller hides the fraction; zero means configured,
 *   with no scheduled day in the window, and the caller shows zero.
 * - **Nothing after today.** A session on Friday has not been missed on
 *   Wednesday. Today itself counts, as on the client.
 *
 * The history comes from `academy_schedules` through `loadMissing`, walked in
 * memory: a roster page asks for twenty windows, and one query each is the
 * N+1 this exists to avoid. Never from the timetable (`academy_classes`),
 * which describes this week only and has no history.
 */
final class ScheduledDays
{
    /**
     * The ISO dates the academy was scheduled to train in [$from, $to], capped
     * at $today. Null when no schedule was ever configured.
     *
     * @return list<string>|null
     */
    public static function between(Academy $academy, CarbonImmutable $from, CarbonImmutable $to, CarbonImmutable $today): ?array
    {
        $history = self::history($academy);
        if (! self::anyConfigured($history)) {
            return null;
        }

        $last = $to->startOfDay()->min($today->startOfDay());
        $days = [];
        for ($day = $from->startOfDay(); $day->lte($last); $day = $day->addDay()) {
            if (self::scheduledIn($history, $day)) {
                $days[] = $day->toDateString();
            }
        }

        return $days;
    }

    /** How many days {@see self::between()} returns; null on the same condition. */
    public static function countBetween(Academy $academy, CarbonImmutable $from, CarbonImmutable $to, CarbonImmutable $today): ?int
    {
        $days = self::between($academy, $from, $to, $today);

        return $days === null ? null : \count($days);
    }

    public static function isScheduledOn(Academy $academy, CarbonImmutable $date): bool
    {
        return self::scheduledIn(self::history($academy), $date);
    }

    /**
     * The $count most recent scheduled days strictly before $date, most recent
     * first. Fewer when the history begins too recently to hold them.
     *
     * @return list<string>
     */
    public static function lastBefore(Academy $academy, CarbonImmutable $date, int $count): array
    {
        $history = self::history($academy);
        if (! self::anyConfigured($history)) {
            return [];
        }

        // Nothing is scheduled before the oldest row, so the walk ends there.
        $oldest = $history[\count($history) - 1]['from'];
        $days = [];
        for ($day = $date->startOfDay()->subDay(); \count($days) < $count && $day->toDateString() >= $oldest; $day = $day->subDay()) {
            if (self::scheduledIn($history, $day)) {
                $days[] = $day->toDateString();
            }
        }

        return $days;
    }

    /**
     * The schedule rows, newest first, as `Y-m-d` strings and weekday lists:
     * `effective_from` is compared as a date string, never as an instant
     * (SQLite lex-compares TEXT, see `AcademySchedule::effectiveFrom()`).
     *
     * @return list<array{from: string, days: list<int>}>
     */
    private static function history(Academy $academy): array
    {
        $academy->loadMissing('schedules');

        $rows = $academy->schedules
            ->map(static fn (AcademySchedule $row): array => [
                'from' => $row->effective_from->toDateString(),
                'days' => array_map(intval(...), $row->training_days ?? []),
            ])
            ->sortByDesc('from')
            ->values()
            ->all();

        /** @var list<array{from: string, days: list<int>}> $rows */
        return $rows;
    }

    /** @param list<array{from: string, days: list<int>}> $history */
    private static function anyConfigured(array $history): bool
    {
        foreach ($history as $row) {
            if ($row['days'] !== []) {
                return true;
            }
        }

        return false;
    }

    /** @param list<array{from: string, days: list<int>}> $history */
    private static function scheduledIn(array $history, CarbonImmutable $day): bool
    {
        $date = $day->toDateString();
        foreach ($history as $row) {
            if ($row['from'] <= $date) {
                return \in_array($day->dayOfWeek, $row['days'], true);
            }
        }

        return false;
    }
}
