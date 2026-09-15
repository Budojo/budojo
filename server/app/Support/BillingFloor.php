<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Academy;
use App\Models\Athlete;
use Carbon\CarbonInterface;

/**
 * The earliest month an athlete can owe anything for (#1742).
 *
 * Two floors, and the answer is the later of them:
 *
 * - **the academy's** `billing_from` — the month Budojo became where this
 *   academy's fees are recorded. Before it, a missing payment row means the
 *   money was handled somewhere else, not that it is owed;
 * - **the athlete's** `joined_at` — nobody owes a fee for a month before they
 *   started training.
 *
 * `max()` of the two, because each is sufficient on its own to make a month
 * meaningless: an athlete who joined in 2021 at an academy that adopted Budojo
 * in 2026 is floored at 2026, and one who joined in 2027 at the same academy
 * is floored at 2027.
 *
 * **A display and aggregation rule, not a write rule.** The owner must still
 * be able to *record* a payment below the floor — transcribing a paper
 * register is exactly the case that produces one. The server's own `min:2020`
 * on the store request is the separate, harder floor, and these two must not
 * be collapsed.
 *
 * One place, per `MonthCoverage`'s precedent: the roster, the athlete's ledger
 * and every arrears figure anyone builds later all ask the same question, and
 * a second implementation is a second answer. It is also why a per-athlete
 * override, if it is ever asked for, is a change to this class and nothing
 * else.
 */
final class BillingFloor
{
    /**
     * The floor as an absolute month index — `year * 12 + (month - 1)` — which
     * is the shape the ledger already compares in, or `null` when nothing
     * floors this athlete.
     *
     * Null is not "floor of zero": it means the caller should behave exactly
     * as it did before the column existed. An academy restored from a backup
     * predating #1742 has `billing_from = null`, and blanking its whole
     * history would be a far worse bug than the one this fixes.
     */
    public static function monthIndexFor(Academy $academy, Athlete $athlete): ?int
    {
        $candidates = array_values(array_filter([
            self::index($academy->billing_from),
            self::index($athlete->joined_at),
        ], static fn (?int $i): bool => $i !== null));

        return $candidates === [] ? null : max($candidates);
    }

    /**
     * The floor as a `Y-m-01` string for the wire, or null.
     *
     * The day is always the 1st: the rule is about months, and emitting a real
     * joining day here would invite a reader to compare it against one.
     */
    public static function isoFor(Academy $academy, Athlete $athlete): ?string
    {
        $index = self::monthIndexFor($academy, $athlete);
        if ($index === null) {
            return null;
        }

        return \sprintf('%04d-%02d-01', intdiv($index, 12), ($index % 12) + 1);
    }

    private static function index(?CarbonInterface $date): ?int
    {
        return $date === null ? null : $date->year * 12 + ($date->month - 1);
    }
}
