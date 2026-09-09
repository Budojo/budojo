<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Academy;
use Carbon\CarbonImmutable;

/**
 * The academy's training year (#1484).
 *
 * A season is a recurring boundary rather than a date: "we start again in
 * September" stays true every year. So the academy stores a MONTH, and this
 * resolves it against a given moment to say which season that moment falls in.
 *
 * A month and not a month-and-day. The day was there first, and it bought
 * nothing: a season boundary lands on the first of a month in every academy
 * that has one, and offering the 14th of September as a choice is a second
 * control to fill in, a second value to get wrong, and a rule ("sessions on
 * the 12th belong to last year") that no one asked for.
 *
 * Why a season at all: the roster used to measure each athlete's attendance
 * against their own joining date, which answers a question about their whole
 * history with the gym. The question an instructor asks in March is about
 * THIS year — and a number that silently spans three of them is not that.
 */
final class Season
{
    /**
     * September, because that is when a European martial-arts year restarts
     * and it is the answer nobody has to think about. An academy that
     * disagrees says so in its settings; one that never opens them gets a
     * sensible year rather than a null.
     */
    public const DEFAULT_MONTH = 9;

    /**
     * The first day of the season containing `$on`.
     *
     * If the boundary has not been passed yet this calendar year, the season
     * began LAST year — a date in March 2026 belongs to the season that
     * started in September 2025, which is the whole point of the type.
     */
    public static function startFor(Academy $academy, CarbonImmutable $on): CarbonImmutable
    {
        $start = CarbonImmutable::create($on->year, $academy->season_start_month ?? self::DEFAULT_MONTH, 1);
        \assert($start !== null);

        return $start->greaterThan($on) ? $start->subYear() : $start;
    }

    /** The last day of the season containing `$on` — the day before it restarts. */
    public static function endFor(Academy $academy, CarbonImmutable $on): CarbonImmutable
    {
        return self::startFor($academy, $on)->addYear()->subDay();
    }

    /**
     * The label a human reads: `2025/26` for a season crossing new year,
     * `2026` for one that does not.
     */
    public static function labelFor(Academy $academy, CarbonImmutable $on): string
    {
        $start = self::startFor($academy, $on);
        $end = self::endFor($academy, $on);

        return $start->year === $end->year
            ? (string) $start->year
            : $start->year . '/' . substr((string) $end->year, -2);
    }
}
