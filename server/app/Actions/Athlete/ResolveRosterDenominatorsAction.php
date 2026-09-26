<?php

declare(strict_types=1);

namespace App\Actions\Athlete;

use App\Models\Academy;
use App\Models\Athlete;
use App\Support\ScheduledDays;
use App\Support\Season;
use Carbon\CarbonImmutable;

/**
 * The denominators of the roster's Sessions cell (#1768), beside the two
 * counts the query already selects, so both halves of the fraction come from
 * one machine and closures reach the roster.
 *
 * - **This month**: the scheduled days from the first of the month, or the
 *   day the athlete joined if later, unless they trained before that day
 *   (trial sessions entered after registering): then from that first
 *   presence. The same window as the month summary (#1767), so one athlete's
 *   month reads the same on both screens.
 * - **This season**: from the season's start, or the day they joined if
 *   later. The season count is floored at the joining day too, so the two
 *   halves measure the same window.
 *
 * Both stop at today and leave closures out (`ScheduledDays`). Null when no
 * schedule was ever configured.
 *
 * **One walk per request.** Every window lies inside [season start, today]
 * (the month never starts before the season, and both stop at today), so the
 * scheduled days of that span are listed once and each row counts the ones
 * on or after its own start. A page of twenty costs one walk, whatever the
 * joining dates.
 */
class ResolveRosterDenominatorsAction
{
    /**
     * Sets `attendance_month_expected` and `attendance_season_expected` on
     * each athlete. Reads `first_attended_this_month`, the earliest presence
     * this month, when the query selected it.
     *
     * @param  iterable<Athlete>  $athletes
     */
    public function execute(Academy $academy, iterable $athletes, CarbonImmutable $now): void
    {
        $today = $now->startOfDay();
        $monthStart = $today->startOfMonth();
        $seasonStart = Season::startFor($academy, $today);

        // Null: no schedule was ever configured, and every row says so.
        $held = ScheduledDays::between($academy, $seasonStart, $today, $today);

        foreach ($athletes as $athlete) {
            $joined = $athlete->joined_at->toImmutable()->startOfDay();
            $first = $this->firstThisMonth($athlete);
            $monthFrom = $first !== null && $first->lessThan($joined) ? $first : $joined;

            $athlete->setAttribute('attendance_month_expected', self::heldSince($held, $monthFrom->max($monthStart)));
            $athlete->setAttribute('attendance_season_expected', self::heldSince($held, $joined->max($seasonStart)));
        }
    }

    /**
     * How many of the listed days fall on or after `$from`.
     *
     * @param  list<string>|null  $held  `Y-m-d`, ascending
     */
    private static function heldSince(?array $held, CarbonImmutable $from): ?int
    {
        if ($held === null) {
            return null;
        }
        $since = $from->toDateString();

        return \count(array_filter($held, static fn (string $day): bool => $day >= $since));
    }

    private function firstThisMonth(Athlete $athlete): ?CarbonImmutable
    {
        $raw = $athlete->getAttribute('first_attended_this_month');

        return \is_string($raw) && $raw !== '' ? CarbonImmutable::parse(substr($raw, 0, 10)) : null;
    }
}
