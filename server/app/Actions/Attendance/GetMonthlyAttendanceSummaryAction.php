<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

use App\Models\Academy;
use App\Support\ScheduledDays;
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
     * `count` is **days**, not rows (#1765): a day with a gi and a no-gi
     * lesson is two rows and one day, and the page's column is headed Days.
     * The leaderboard counts the same way.
     *
     * `expected_count` is **that athlete's** denominator (#1767): the days the
     * academy was scheduled to train in the month, from the day they joined,
     * closures out and nothing after today (`ScheduledDays`). Someone who
     * joined on the 20th is measured against the sessions after the 20th, as
     * on the roster and the athlete tab. Null when no schedule was ever
     * configured, which hides the fraction; zero is a real zero.
     *
     * `meta.training_days` is the academy's own count for the month, for the
     * page's header. It is deliberately nobody's denominator.
     *
     * Sorted by count DESC, then last_name ASC — the instructor's first
     * question is "who's showing up the most?", and alphabetical is the
     * neutral tiebreak.
     *
     * @return array{
     *     rows: Collection<int, array{athlete_id: int, first_name: string, last_name: string, count: int, expected_count: int|null}>,
     *     meta: array{training_days: int|null, month: string},
     * }
     */
    public function execute(Academy $academy, CarbonImmutable $month): array
    {
        $start = $month->startOfMonth()->toDateString();
        $end = $month->endOfMonth()->toDateString();
        $today = CarbonImmutable::today();

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
            ->groupBy('athletes.id', 'athletes.first_name', 'athletes.last_name', 'athletes.joined_at')
            ->select([
                'athletes.id as athlete_id',
                'athletes.first_name',
                'athletes.last_name',
                'athletes.joined_at',
                DB::raw('COUNT(DISTINCT attendance_records.attended_on) as count'),
            ])
            ->orderByDesc('count')
            ->orderBy('athletes.last_name_sort')
            ->orderBy('athletes.id')
            ->get();

        $monthStart = CarbonImmutable::parse($start);
        $monthEnd = CarbonImmutable::parse($end);
        // One walk per distinct window: athletes who joined before the month
        // all share the first one.
        $expected = [];
        $expectedFrom = function (mixed $joinedAt) use ($academy, $monthStart, $monthEnd, $today, &$expected): ?int {
            $joined = \is_string($joinedAt) ? CarbonImmutable::parse(substr($joinedAt, 0, 10)) : $monthStart;
            $from = $joined->greaterThan($monthStart) ? $joined : $monthStart;
            $key = $from->toDateString();

            return $expected[$key] ??= ScheduledDays::countBetween($academy, $from, $monthEnd, $today);
        };

        return [
            'rows' => $rows->map(fn ($row): array => [
                'athlete_id' => (int) $row->athlete_id,
                'first_name' => (string) $row->first_name,
                'last_name' => (string) $row->last_name,
                'count' => (int) $row->count,
                'expected_count' => $expectedFrom($row->joined_at),
            ]),
            'meta' => [
                'training_days' => ScheduledDays::countBetween($academy, $monthStart, $monthEnd, $today),
                'month' => $monthStart->format('Y-m'),
            ],
        ];
    }
}
