<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Models\Academy;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Aggregates attendance counts per (year, month) for the academy over
 * the trailing N months ending with the current month, INCLUSIVE.
 *
 * Buckets split by the athlete's CURRENT status (active vs paused) at
 * query time — NOT status-at-attendance-time. This is the conscious
 * tradeoff documented in the spec: "where are these people NOW" is
 * the operationally useful read, and it dodges the join + temporal
 * lookup that status-at-record-time would require.
 *
 * The response key "paused" groups all non-active statuses (suspended
 * + inactive) — a binary active/non-active split is sufficient for
 * the bar chart, and the enum does not have a "paused" case.
 *
 * Returns the full month sequence even when a month has zero records
 * (frontend draws a continuous line / contiguous bars). SQL groupBy
 * never emits empty buckets, so we backfill in PHP.
 */
class MonthlyAttendanceStatsAction
{
    /**
     * @return list<array{month: string, active: int, paused: int}>
     */
    public function execute(Academy $academy, int $months): array
    {
        $now = CarbonImmutable::now()->startOfMonth();
        $start = $now->subMonths($months - 1);
        $end = $now->endOfMonth();

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
                $end->toDateString(),
            ])
            ->groupBy(DB::raw($yearExpr), DB::raw($monthExpr), 'athletes.status')
            ->orderBy(DB::raw($yearExpr))
            ->orderBy(DB::raw($monthExpr))
            ->select([
                DB::raw("{$yearExpr} as year"),
                DB::raw("{$monthExpr} as month"),
                'athletes.status as status',
                DB::raw('COUNT(*) as count'),
            ])
            ->get();

        // Bucket map keyed by 'YYYY-MM' for O(1) backfill.
        // Non-active statuses (suspended, inactive) map to the "paused"
        // response key — a binary active/non-active split for the chart.
        $byKey = [];
        foreach ($rows as $row) {
            $key = \sprintf('%04d-%02d', (int) $row->year, (int) $row->month);
            if (! isset($byKey[$key])) {
                $byKey[$key] = ['active' => 0, 'paused' => 0];
            }
            $bucket = (string) $row->status === 'active' ? 'active' : 'paused';
            $byKey[$key][$bucket] += (int) $row->count;
        }

        // Backfill the full month sequence, oldest → newest.
        $out = [];
        $cursor = $start;
        for ($i = 0; $i < $months; $i++) {
            $key = $cursor->format('Y-m');
            $out[] = [
                'month' => $key,
                'active' => $byKey[$key]['active'] ?? 0,
                'paused' => $byKey[$key]['paused'] ?? 0,
            ];
            $cursor = $cursor->addMonth();
        }

        return $out;
    }
}
