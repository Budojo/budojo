<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Models\Academy;
use App\Models\AthletePayment;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Aggregates `athlete_payments.amount_cents` per business (year, month)
 * for the academy over the trailing N months ending with the current
 * month, INCLUSIVE.
 *
 * Bucketing field: the business month(s) the fee covers, NOT `paid_at`
 * (the wall-clock recording time). The two are typically equal today — the
 * API doesn't accept a custom `paid_at` — but the business month is the
 * user-facing definition of "this month's revenue".
 *
 * **Two rules, deliberately, and they are different (#1553).**
 *
 * A FEE covers a **period**, so its amount is spread evenly across every month
 * that period pays for: a €165 quarterly contributes €55 to each of three
 * buckets rather than €165 to one. Booking it whole would make an academy that
 * bills quarterly read €0 for two months in three. The split is done in PHP —
 * SQL cannot expand one row into three buckets without a calendar table, and
 * the volume here is one academy's payments over at most a couple of years.
 *
 * A CARNET lands whole in the month it was **sold**. It was spread like a fee
 * until #1553, on the reasoning that a pack is bought for its validity window
 * — which is true and which made it invisible: selling a €70 twelve-month
 * carnet moved the chart by €5.83, and the owner who had just taken €70 could
 * not find it. A carnet is a lump the academy either took or did not; a fee is
 * an entitlement that accrues. Same chart, two rules, said out loud here and
 * in the hint under the chart because a reader cannot infer it.
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
    private const string CURRENCY = 'EUR';

    /**
     * @return list<array{month: string, currency: string, amount_cents: int, future: bool}>
     */
    public function execute(Academy $academy, int $months): array
    {
        $now = CarbonImmutable::now()->startOfMonth();
        $start = $now->subMonths($months - 1);

        // Pre-extract scalar bounds so closures capture ints, not the full
        // CarbonImmutable object. This also satisfies PHPStan's closure.unusedUse
        // rule — each closure only uses the variables it actually references.
        $startYear = (int) $start->format('Y');
        $startMonth = (int) $start->format('m');
        $nowYear = (int) $now->format('Y');
        $nowMonth = (int) $now->format('m');

        $firstBucket = AthletePayment::monthIndex($startYear, $startMonth);
        $currentBucket = AthletePayment::monthIndex($nowYear, $nowMonth);

        /** @var array<string, int> $byKey */
        $byKey = [];

        // Every fee whose period REACHES the window. No upper bound: a period
        // running past today is exactly what the extended window exists to
        // show, so the query cannot be the thing that cuts it off.
        $payments = DB::table('athlete_payments')
            ->join('athletes', 'athletes.id', '=', 'athlete_payments.athlete_id')
            ->where('athletes.academy_id', $academy->id)
            ->whereRaw(
                '(athlete_payments.year * 12 + athlete_payments.month - 1 + athlete_payments.period_months) > ?',
                [$firstBucket],
            )
            ->select([
                'athlete_payments.year',
                'athlete_payments.month',
                'athlete_payments.period_months',
                'athlete_payments.amount_cents',
            ])
            ->get();

        // How far right the chart has to reach: the current month, or the last
        // month any fee has already been paid for, whichever is later.
        $lastBucket = $currentBucket;
        foreach ($payments as $row) {
            $end = AthletePayment::monthIndex((int) $row->year, (int) $row->month)
                + max(1, (int) $row->period_months) - 1;
            $lastBucket = max($lastBucket, $end);
        }

        foreach ($payments as $row) {
            $this->spread(
                $byKey,
                AthletePayment::monthIndex((int) $row->year, (int) $row->month),
                max(1, (int) $row->period_months),
                (int) $row->amount_cents,
                $firstBucket,
                $lastBucket,
            );
        }

        // Carnets (#1383, changed in #1553). Booked whole into the month the
        // pack was SOLD. `purchased_at`, not `valid_from`: the money arrives
        // when the academy takes it, and a carnet bought in August to start in
        // September is August's takings.
        $carnets = DB::table('carnets')
            ->join('athletes', 'athletes.id', '=', 'carnets.athlete_id')
            ->where('athletes.academy_id', $academy->id)
            ->select(['carnets.purchased_at', 'carnets.price_cents'])
            ->get();

        foreach ($carnets as $carnet) {
            $soldOn = CarbonImmutable::parse((string) $carnet->purchased_at);
            $bucket = AthletePayment::monthIndex((int) $soldOn->year, (int) $soldOn->month);

            if ($bucket < $firstBucket || $bucket > $lastBucket) {
                continue;
            }

            $key = \sprintf('%04d-%02d', intdiv($bucket, 12), ($bucket % 12) + 1);
            $byKey[$key] = ($byKey[$key] ?? 0) + (int) $carnet->price_cents;
        }

        $out = [];
        for ($bucket = $firstBucket; $bucket <= $lastBucket; $bucket++) {
            $key = \sprintf('%04d-%02d', intdiv($bucket, 12), ($bucket % 12) + 1);
            $out[] = [
                'month' => $key,
                'currency' => self::CURRENCY,
                'amount_cents' => $byKey[$key] ?? 0,
                'future' => $bucket > $currentBucket,
            ];
        }

        return $out;
    }

    /**
     * Adds one amount to the buckets it belongs to, split evenly across
     * `$span` months from `$periodStart`.
     *
     * Integer division with the remainder on the first month, so the parts
     * always sum back to the whole: twelve buckets of a €100.01 annual still
     * add up to €100.01. Buckets outside the requested window are skipped
     * rather than clamped — a period that starts before the chart still
     * contributes only the months the chart shows.
     *
     * @param  array<string, int>  $byKey
     */
    private function spread(
        array &$byKey,
        int $periodStart,
        int $span,
        int $total,
        int $firstBucket,
        int $lastBucket,
    ): void {
        $share = intdiv($total, $span);
        $remainder = $total - ($share * $span);

        for ($i = 0; $i < $span; $i++) {
            $bucket = $periodStart + $i;
            if ($bucket < $firstBucket || $bucket > $lastBucket) {
                continue;
            }

            $key = \sprintf('%04d-%02d', intdiv($bucket, 12), ($bucket % 12) + 1);
            $byKey[$key] = ($byKey[$key] ?? 0) + $share + ($i === 0 ? $remainder : 0);
        }
    }
}
