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
 * Since #1382 a payment covers a **period**, so its amount is spread evenly
 * across every month that period pays for: a €165 quarterly contributes €55
 * to each of three buckets rather than €165 to one. Booking it whole would
 * make an academy that bills quarterly read €0 for two months in three,
 * which is exactly the "revenue *for* this month" promise this endpoint has
 * always made. The split is done in PHP — SQL cannot expand one row into
 * three buckets without a calendar table, and the volume here is one
 * academy's payments over at most 24 months.
 *
 * Carnets join the same axis under the same rule (#1383): a pack is collected
 * in one go but bought for its whole validity window, so €70 valid twelve
 * months contributes about €5.83 a month. The alternative — booking it into
 * the sale month — would put two different rules on one chart, and the sum of
 * every bucket would stop being what the academy actually took.
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
     * @return list<array{month: string, currency: string, amount_cents: int}>
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
        $lastBucket = AthletePayment::monthIndex($nowYear, $nowMonth);

        /** @var array<string, int> $byKey */
        $byKey = [];

        // Every payment whose period OVERLAPS the window, not just one that
        // starts inside it: a quarterly bought the month before the window
        // still pays for its first months.
        $payments = DB::table('athlete_payments')
            ->join('athletes', 'athletes.id', '=', 'athlete_payments.athlete_id')
            ->where('athletes.academy_id', $academy->id)
            ->whereRaw('(athlete_payments.year * 12 + athlete_payments.month - 1) <= ?', [$lastBucket])
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

        // Carnets (#1383). A pack is collected in one go but bought for the
        // whole of its validity window, so it lands on this axis the same way
        // an annual fee does — spread across the months it covers. Booking it
        // whole into the sale month would leave the chart running two rules
        // at once: fees spread, carnets not.
        $carnets = DB::table('carnets')
            ->join('athletes', 'athletes.id', '=', 'carnets.athlete_id')
            ->where('athletes.academy_id', $academy->id)
            // Only the windows that reach the chart. Expressed as plain date
            // comparisons rather than the month arithmetic used above: the
            // columns are dates, and `expires_at` already carries the far end
            // of the window, so this needs no substring surgery on a
            // `YYYY-MM-DD` string to stay portable.
            ->where('carnets.valid_from', '<=', $now->endOfMonth()->toDateString())
            ->where('carnets.expires_at', '>', $start->toDateString())
            ->select(['carnets.valid_from', 'carnets.expires_at', 'carnets.price_cents'])
            ->get();

        foreach ($carnets as $carnet) {
            $validFrom = CarbonImmutable::parse((string) $carnet->valid_from);
            $expiresAt = CarbonImmutable::parse((string) $carnet->expires_at);

            $windowStart = AthletePayment::monthIndex((int) $validFrom->year, (int) $validFrom->month);
            // The expiry month itself gets nothing: a carnet valid from 1 Sep
            // 2026 to 1 Sep 2027 covers the twelve months Sep-Aug, and the
            // difference of the two indices is exactly that count.
            $span = max(
                1,
                AthletePayment::monthIndex((int) $expiresAt->year, (int) $expiresAt->month) - $windowStart,
            );

            $this->spread($byKey, $windowStart, $span, (int) $carnet->price_cents, $firstBucket, $lastBucket);
        }

        $out = [];
        $cursor = $start;
        for ($i = 0; $i < $months; $i++) {
            $key = $cursor->format('Y-m');
            $out[] = [
                'month' => $key,
                'currency' => self::CURRENCY,
                'amount_cents' => $byKey[$key] ?? 0,
            ];
            $cursor = $cursor->addMonth();
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
