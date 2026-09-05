<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Carnet;
use Carbon\CarbonInterface;

/**
 * The single expression of "can this carnet pay for a session on date D".
 *
 * It exists as a dependency-free helper rather than as model methods because
 * `server/CLAUDE.md` keeps business logic out of models, and rather than being
 * inlined at each call site because there are two of them with opposite
 * shapes: `ConsumeCarnetEntriesAction` asks it of candidate rows while
 * deciding what to charge, and the API resources ask it of rows on the way
 * out. Written twice, the two would drift.
 *
 * Static for the same reason as `RoleCapabilities`: no state, no dependency,
 * nothing to swap in a test — and a readable call site.
 */
final class CarnetAvailability
{
    /**
     * Balance is derived, never stored: the ledger row count IS the number of
     * entries spent.
     */
    public static function remainingEntries(Carnet $carnet): int
    {
        // A caller that skipped `withCount('entries')` would otherwise read a
        // silently-full balance. On a number that decides whether an athlete
        // gets charged, failing loudly beats being quietly wrong.
        $spent = $carnet->entries_count ?? throw new \LogicException(
            'Carnet balance read without withCount(\'entries\') — the count is the balance.',
        );

        return $carnet->total_entries - $spent;
    }

    /**
     * Spendable on `$date`: inside the validity window AND with entries left.
     *
     * The window is `valid_from`..`expires_at`, not the purchase date (#1380):
     * a carnet sold today can be set to cover March, and the sessions already
     * recorded in March then count against it.
     *
     * Checked against the date being *attended*, never against today.
     */
    public static function isActiveOn(Carnet $carnet, CarbonInterface $date): bool
    {
        return self::remainingEntries($carnet) > 0
            && $carnet->valid_from->startOfDay()->lessThanOrEqualTo($date->copy()->startOfDay())
            && $carnet->expires_at->startOfDay()->greaterThanOrEqualTo($date->copy()->startOfDay());
    }
}
