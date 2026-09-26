<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Models\Academy;
use App\Models\AthletePayment;
use App\Support\CollectedByMonth;
use Carbon\CarbonImmutable;

/**
 * Aggregates what the academy took per business (year, month) over the
 * trailing N months ending with the current month, INCLUSIVE.
 *
 * Bucketing field: the business month(s) the money covers, NOT `paid_at`
 * (the day the money arrived, #1761). What lands in each month — a fee spread
 * across its period, a carnet whole in its sale month (#1553) — is decided by
 * `CollectedByMonth`, which the money tiles read too (#1758): a bar and a tile
 * for the same month cannot disagree when neither computes it.
 *
 * **The window extends forward to the last month already paid for (#1553).**
 * It used to stop at the current month, so the slices of a period reaching
 * into the future had nowhere to land and simply vanished: a €240 quarterly
 * paid in September showed €80 and the other €160 appeared on no bar at all.
 * The last bar — the one an owner actually looks at — was therefore always a
 * fraction of what came in, and the chart's own total did not match the
 * ledger. Extending means every bucket a payment reaches is visible, and the
 * sum of the bars is what the academy has been paid. Buckets past the current
 * month carry `future: true` so the SPA can draw them as what they are:
 * already collected, not yet earned.
 *
 * `currency` is currently hardcoded to EUR — single-currency-per-academy
 * is the model invariant and the academies table doesn't carry a
 * `currency` column yet. The day it does, swap the constant for
 * $academy->currency.
 */
class MonthlyPaymentsStatsAction
{
    public const string CURRENCY = 'EUR';

    public function __construct(
        private readonly CollectedByMonth $collected,
    ) {
    }

    /**
     * @return list<array{month: string, currency: string, amount_cents: int, future: bool}>
     */
    public function execute(Academy $academy, int $months): array
    {
        $now = CarbonImmutable::now()->startOfMonth();
        $start = $now->subMonths($months - 1);

        $firstBucket = AthletePayment::monthIndex((int) $start->format('Y'), (int) $start->format('m'));
        $currentBucket = AthletePayment::monthIndex((int) $now->format('Y'), (int) $now->format('m'));

        $out = [];
        foreach ($this->collected->from($academy, $firstBucket, $currentBucket) as $bucket => $cents) {
            $out[] = [
                'month' => \sprintf('%04d-%02d', intdiv($bucket, 12), ($bucket % 12) + 1),
                'currency' => self::CURRENCY,
                'amount_cents' => $cents,
                'future' => $bucket > $currentBucket,
            ];
        }

        return $out;
    }
}
