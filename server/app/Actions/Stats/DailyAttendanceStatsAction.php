<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Models\Academy;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Returns daily attendance counts for the academy over the trailing
 * N months ending TODAY (inclusive). Only days with count > 0 are
 * emitted — frontend backfills zeros when laying out the heatmap
 * grid. Sparse response keeps the payload ~100 rows even for a busy
 * 12-month window.
 *
 * Drives the GitHub-contributions-style heatmap on the Stats →
 * Attendance tab. Bucketing field is `attended_on`. Soft-deleted
 * records excluded.
 *
 * @return list<array{date: string, count: int}>
 */
class DailyAttendanceStatsAction
{
    /**
     * @return list<array{date: string, count: int}>
     */
    public function execute(Academy $academy, int $months): array
    {
        $today = CarbonImmutable::now()->startOfDay();
        // +1 day so a 3-month window ending today is exactly 3 calendar
        // months back to today, inclusive of both endpoints.
        $start = $today->subMonths($months)->addDay();

        $rows = DB::table('attendance_records')
            ->join('athletes', 'athletes.id', '=', 'attendance_records.athlete_id')
            ->where('athletes.academy_id', $academy->id)
            ->whereNull('attendance_records.deleted_at')
            ->whereBetween('attendance_records.attended_on', [
                $start->toDateString(),
                $today->toDateString(),
            ])
            ->groupBy('attendance_records.attended_on')
            ->orderBy('attendance_records.attended_on')
            ->select([
                'attendance_records.attended_on as date',
                DB::raw('COUNT(*) as count'),
            ])
            ->get();

        return array_values($rows->map(static fn ($row) => [
            'date' => (string) $row->date,
            'count' => (int) $row->count,
        ])->all());
    }
}
