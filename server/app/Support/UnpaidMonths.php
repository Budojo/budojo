<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AthletePayment;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Collection;

/**
 * The months nothing paid for (#1760), for the arrears list and the ledger's
 * «In ritardo» (#1654).
 *
 * Two surfaces calling a month late by two rules is how the ledger came to
 * flag an athlete on a free tier the arrears list rightly ignored, so both ask
 * here. A month is late when it is:
 *
 * - **past** — up to last month, never the current one, which belongs to the
 *   unpaid chip and its day-16 digest;
 * - **at or after the billing floor** (`BillingFloor`) — an athlete with no
 *   floor is never late, as the arrears list has always treated them;
 * - **paid for by nothing** — `Athlete::scopePaidDuring`: no covering
 *   payment and no carnet spendable on some day of it.
 *
 * Who can be late at all is the caller's `Athlete::scopeCanFallBehind`.
 */
final class UnpaidMonths
{
    /**
     * The unpaid month indexes per athlete id, oldest first; an athlete behind
     * on nothing is absent. `$year` narrows to that calendar year.
     *
     * One query per month over every athlete given: a season is a dozen
     * queries, where one per athlete per month would be hundreds.
     *
     * @param  Collection<int, Athlete>  $athletes
     * @return array<int, list<int>>
     */
    public static function of(Collection $athletes, Academy $academy, CarbonInterface $today, ?int $year = null): array
    {
        $to = AthletePayment::monthIndex($today->year, $today->month) - 1;
        $from = null;
        if ($year !== null) {
            $from = AthletePayment::monthIndex($year, 1);
            $to = min($to, AthletePayment::monthIndex($year, 12));
        }

        $floors = self::floorsOf($athletes, $academy, $to);
        if ($floors === []) {
            return [];
        }

        $unpaid = [];
        $ids = array_keys($floors);
        for ($index = max($from ?? \PHP_INT_MIN, min($floors)); $index <= $to; $index++) {
            [$y, $m] = [intdiv($index, 12), $index % 12 + 1];

            /** @var list<int> $behind */
            $behind = Athlete::query()
                ->whereIn('id', $ids)
                ->whereNot(fn ($q) => $q->paidDuring($y, $m))
                ->pluck('id')
                ->all();

            foreach ($behind as $id) {
                if ($floors[$id] <= $index) {
                    $unpaid[$id][] = $index;
                }
            }
        }

        return $unpaid;
    }

    /** A month index as the wire writes it: `2026-03`. */
    public static function format(int $index): string
    {
        return \sprintf('%04d-%02d', intdiv($index, 12), $index % 12 + 1);
    }

    /**
     * Each athlete's floor, for those who have one no later than `$to`.
     *
     * @param  Collection<int, Athlete>  $athletes
     * @return array<int, int>
     */
    private static function floorsOf(Collection $athletes, Academy $academy, int $to): array
    {
        $floors = [];
        foreach ($athletes as $athlete) {
            $floor = BillingFloor::monthIndexFor($academy, $athlete);
            if ($floor !== null && $floor <= $to) {
                $floors[$athlete->id] = $floor;
            }
        }

        return $floors;
    }
}
