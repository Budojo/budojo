<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Academy;
use App\Models\AthletePayment;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * What an academy took, month by month (#1553, extracted in #1758).
 *
 * The one place "collected in a month" is decided, read by the revenue chart
 * (`MonthlyPaymentsStatsAction`) and by the money tiles above it
 * (`PaymentsSummaryAction`). A bar and a tile for the same month showing two
 * numbers is the failure the tiles exist to avoid, so neither computes it.
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
 * an entitlement that accrues.
 *
 * Months are `AthletePayment::monthIndex()` buckets (`year * 12 + month - 1`).
 */
final class CollectedByMonth
{
    /**
     * Cents taken per month, for every month from `$first` to the later of
     * `$atLeastUntil` and the last month any fee reaching `$first` has already
     * been paid for — so a period running into the future lands somewhere
     * instead of vanishing off the end (#1553). Months with nothing are 0.
     *
     * @return array<int, int> month index => cents, contiguous and ascending
     */
    public function from(Academy $academy, int $first, int $atLeastUntil): array
    {
        // Every fee whose period REACHES the window. No upper bound: a period
        // running past `$atLeastUntil` is exactly what the extension shows.
        $payments = DB::table('athlete_payments')
            ->join('athletes', 'athletes.id', '=', 'athlete_payments.athlete_id')
            ->where('athletes.academy_id', $academy->id)
            ->whereRaw(
                '(athlete_payments.year * 12 + athlete_payments.month - 1 + athlete_payments.period_months) > ?',
                [$first],
            )
            ->select([
                'athlete_payments.year',
                'athlete_payments.month',
                'athlete_payments.period_months',
                'athlete_payments.amount_cents',
            ])
            ->get();

        $last = $atLeastUntil;
        foreach ($payments as $row) {
            $end = AthletePayment::monthIndex((int) $row->year, (int) $row->month)
                + max(1, (int) $row->period_months) - 1;
            $last = max($last, $end);
        }

        /** @var array<int, int> $cents */
        $cents = array_fill_keys(range($first, max($first, $last)), 0);

        foreach ($payments as $row) {
            $this->spread(
                $cents,
                AthletePayment::monthIndex((int) $row->year, (int) $row->month),
                max(1, (int) $row->period_months),
                (int) $row->amount_cents,
            );
        }

        // Booked whole into the month the pack was SOLD. `purchased_at`, not
        // `valid_from`: the money arrives when the academy takes it, and a
        // carnet bought in August to start in September is August's takings.
        $carnets = DB::table('carnets')
            ->join('athletes', 'athletes.id', '=', 'carnets.athlete_id')
            ->where('athletes.academy_id', $academy->id)
            ->select(['carnets.purchased_at', 'carnets.price_cents'])
            ->get();

        foreach ($carnets as $carnet) {
            $soldOn = CarbonImmutable::parse((string) $carnet->purchased_at);
            $month = AthletePayment::monthIndex($soldOn->year, $soldOn->month);

            if (isset($cents[$month])) {
                $cents[$month] += (int) $carnet->price_cents;
            }
        }

        return $cents;
    }

    /**
     * Adds one amount to the months it belongs to, split evenly across
     * `$span` months from `$periodStart`.
     *
     * Integer division with the remainder on the first month, so the parts
     * always sum back to the whole: twelve buckets of a €100.01 annual still
     * add up to €100.01. Months outside the window are skipped rather than
     * clamped — a period that starts before it still contributes only the
     * months the window shows.
     *
     * @param  array<int, int>  $cents
     */
    private function spread(array &$cents, int $periodStart, int $span, int $total): void
    {
        $share = intdiv($total, $span);
        $remainder = $total - ($share * $span);

        for ($i = 0; $i < $span; $i++) {
            $month = $periodStart + $i;
            if (isset($cents[$month])) {
                $cents[$month] += $share + ($i === 0 ? $remainder : 0);
            }
        }
    }
}
