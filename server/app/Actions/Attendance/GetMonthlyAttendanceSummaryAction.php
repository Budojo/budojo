<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

use App\Models\Academy;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class GetMonthlyAttendanceSummaryAction
{
    /**
     * Aggregate attendance counts per athlete for a single calendar month,
     * scoped to a single academy. Returns rows only for athletes with at
     * least one active (non-deleted) record in that month — PRD § P0.2
     * Given/When/Then "it lists only athletes with at least one attendance
     * record that month".
     *
     * Shape of each row: { athlete_id, first_name, last_name, count }.
     *
     * Sorted by count DESC, then last_name ASC — the instructor's first
     * question is "who's showing up the most?", and alphabetical is the
     * neutral tiebreak.
     *
     * @return Collection<int, array{athlete_id: int, first_name: string, last_name: string, count: int}>
     */
    public function execute(Academy $academy, CarbonImmutable $month): Collection
    {
        $start = $month->startOfMonth()->toDateString();
        $end = $month->endOfMonth()->toDateString();

        $rows = DB::table('attendance_records')
            ->join('athletes', 'athletes.id', '=', 'attendance_records.athlete_id')
            ->where('athletes.academy_id', $academy->id)
            ->whereNull('attendance_records.deleted_at')
            // Plain whereBetween keeps the query sargable — the column isn't
            // wrapped in a function, so MySQL can use the (attended_on) index
            // for the range scan. The `date:Y-m-d` cast + the DATE column
            // type ensure the stored value is date-only on both MySQL (native
            // DATE) and SQLite (normalized on write via the cast), so a
            // direct string range works across engines.
            ->whereBetween('attendance_records.attended_on', [$start, $end])
            ->groupBy('athletes.id', 'athletes.first_name', 'athletes.last_name')
            ->select([
                'athletes.id as athlete_id',
                'athletes.first_name',
                'athletes.last_name',
                DB::raw('COUNT(*) as count'),
            ])
            ->orderByDesc('count')
            ->orderBy('athletes.last_name')
            ->get();

        return $rows->map(fn ($row) => [
            'athlete_id' => (int) $row->athlete_id,
            'first_name' => (string) $row->first_name,
            'last_name' => (string) $row->last_name,
            'count' => (int) $row->count,
        ]);
    }
}
