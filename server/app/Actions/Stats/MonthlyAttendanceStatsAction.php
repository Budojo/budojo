<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Models\Academy;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Aggregates attendance counts and distinct training days per (year, month)
 * for the academy over the trailing N months ending with the current month,
 * INCLUSIVE.
 *
 * Returns two numerals per bucket:
 *  - attendance_count: total non-deleted attendance rows in the month.
 *  - training_days: COUNT(DISTINCT attended_on) — the number of distinct
 *    dates where at least one attendance was recorded. This is the honest
 *    denominator for "average attendance per training day", requiring no
 *    "scheduled training days" config and no backfill for closed days.
 *
 * The frontend computes the average as attendance_count / training_days
 * (with a ?? 0 guard when training_days === 0). Returning the two
 * components instead of the pre-computed average lets the same payload
 * drive both "average per training day" and "raw monthly total" charts
 * without an additive contract change.
 *
 * Returns the full month sequence even when a month has zero records
 * (frontend draws contiguous bars). SQL groupBy never emits empty
 * buckets, so we backfill in PHP.
 */
class MonthlyAttendanceStatsAction
{
    /**
     * @return list<array{month: string, attendance_count: int, training_days: int}>
     */
    public function execute(Academy $academy, int $months): array
    {
        $now = CarbonImmutable::now()->startOfMonth();
        $start = $now->subMonths($months - 1);

        // Cross-DB year/month extraction: feature tests use sqlite
        // in-memory (strftime), production uses MySQL (YEAR/MONTH).
        // Pick the dialect at action-time so the wrong query never
        // touches the wrong driver. Mirrors the same pattern other
        // raw aggregations use in this codebase.
        $driver = DB::connection()->getDriverName();
        $yearExpr = $driver === 'mysql'
            ? 'YEAR(attendance_records.attended_on)'
            : "CAST(strftime('%Y', attendance_records.attended_on) AS INTEGER)";
        $monthExpr = $driver === 'mysql'
            ? 'MONTH(attendance_records.attended_on)'
            : "CAST(strftime('%m', attendance_records.attended_on) AS INTEGER)";

        $rows = DB::table('attendance_records')
            ->join('athletes', 'athletes.id', '=', 'attendance_records.athlete_id')
            ->where('athletes.academy_id', $academy->id)
            ->whereNull('attendance_records.deleted_at')
            ->whereBetween('attendance_records.attended_on', [
                $start->toDateString(),
                $now->endOfMonth()->toDateString(),
            ])
            ->groupBy(DB::raw($yearExpr), DB::raw($monthExpr))
            ->orderBy(DB::raw($yearExpr))
            ->orderBy(DB::raw($monthExpr))
            ->select([
                DB::raw("{$yearExpr} as year"),
                DB::raw("{$monthExpr} as month"),
                DB::raw('COUNT(*) as attendance_count'),
                DB::raw('COUNT(DISTINCT attendance_records.attended_on) as training_days'),
            ])
            ->get();

        // Bucket map keyed by 'YYYY-MM' for O(1) backfill.
        $byKey = [];
        foreach ($rows as $row) {
            $key = \sprintf('%04d-%02d', (int) $row->year, (int) $row->month);
            $byKey[$key] = [
                'attendance_count' => (int) $row->attendance_count,
                'training_days' => (int) $row->training_days,
            ];
        }

        // Backfill the full month sequence, oldest → newest.
        $out = [];
        $cursor = $start;
        for ($i = 0; $i < $months; $i++) {
            $key = $cursor->format('Y-m');
            $out[] = [
                'month' => $key,
                'attendance_count' => $byKey[$key]['attendance_count'] ?? 0,
                'training_days' => $byKey[$key]['training_days'] ?? 0,
            ];
            $cursor = $cursor->addMonth();
        }

        return $out;
    }
}
