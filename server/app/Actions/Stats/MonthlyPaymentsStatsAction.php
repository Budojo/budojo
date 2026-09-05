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

        // Every payment whose period OVERLAPS the window, not just one that
        // starts inside it: a quarterly bought the month before the window
        // still pays for its first months.
        $rows = DB::table('athlete_payments')
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

        /** @var array<string, int> $byKey */
        $byKey = [];
        foreach ($rows as $row) {
            $periodStart = AthletePayment::monthIndex((int) $row->year, (int) $row->month);
            $span = max(1, (int) $row->period_months);
            $total = (int) $row->amount_cents;

            // Integer split whose parts sum back to the total: the remainder
            // goes on the first month rather than evaporating, so twelve
            // buckets of a €100.01 annual still add up to €100.01.
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
}
