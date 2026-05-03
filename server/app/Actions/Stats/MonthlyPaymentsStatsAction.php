<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Models\Academy;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Aggregates `athlete_payments.amount_cents` per business (year, month)
 * for the academy over the trailing N months ending with the current
 * month, INCLUSIVE.
 *
 * Bucketing field: `(year, month)` (the business month the fee covers),
 * NOT `paid_at` (the wall-clock recording time). The two are typically
 * equal today — the API doesn't accept a custom `paid_at` — but the
 * business month is the user-facing definition of "this month's revenue".
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

        $rows = DB::table('athlete_payments')
            ->join('athletes', 'athletes.id', '=', 'athlete_payments.athlete_id')
            ->where('athletes.academy_id', $academy->id)
            // Window: only months whose (year, month) tuple is within
            // [start, now]. Cheaper than a date-string comparison;
            // (year, month) are tinyint/smallint so the predicate stays
            // sargable on the existing primary key.
            ->where(function ($q) use ($startYear, $startMonth, $nowYear, $nowMonth): void {
                $q->where(function ($q2) use ($startYear, $startMonth): void {
                    $q2->where('athlete_payments.year', '>', $startYear)
                       ->orWhere(function ($q3) use ($startYear, $startMonth): void {
                           $q3->where('athlete_payments.year', $startYear)
                              ->where('athlete_payments.month', '>=', $startMonth);
                       });
                })->where(function ($q2) use ($nowYear, $nowMonth): void {
                    $q2->where('athlete_payments.year', '<', $nowYear)
                       ->orWhere(function ($q3) use ($nowYear, $nowMonth): void {
                           $q3->where('athlete_payments.year', $nowYear)
                              ->where('athlete_payments.month', '<=', $nowMonth);
                       });
                });
            })
            ->groupBy('athlete_payments.year', 'athlete_payments.month')
            ->orderBy('athlete_payments.year')
            ->orderBy('athlete_payments.month')
            ->select([
                'athlete_payments.year',
                'athlete_payments.month',
                DB::raw('SUM(athlete_payments.amount_cents) as amount_cents'),
            ])
            ->get();

        $byKey = [];
        foreach ($rows as $row) {
            $key = \sprintf('%04d-%02d', (int) $row->year, (int) $row->month);
            $byKey[$key] = (int) $row->amount_cents;
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
