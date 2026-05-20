<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

use App\Models\Athlete;
use App\Models\AttendanceRecord;
use Carbon\CarbonImmutable;

class GetAthleteAttendanceSummaryAction
{
    /**
     * Per-athlete attendance summary over the last N days.
     *
     * Denominator is "realized lesson days" — every distinct date in the
     * window where ANY attendance row exists for the athlete's academy
     * AND the athlete was already on the roster (joined_at ≤ date). This
     * avoids penalizing athletes for closures / cancellations and gives
     * an honest "out of lessons that happened, you came to X%".
     *
     * @return array{
     *   range_days: int,
     *   range_start: string,
     *   range_end: string,
     *   attended_count: int,
     *   expected_count: int,
     *   rate: float|null,
     *   series: list<array{date: string, attended: bool}>
     * }
     */
    public function execute(Athlete $athlete, int $rangeDays): array
    {
        $today = CarbonImmutable::now()->startOfDay();
        $windowStart = $today->subDays($rangeDays - 1);

        // Clip the lower bound at joined_at — a lesson day before the
        // athlete was on the roster cannot be expected of them.
        $athleteJoined = CarbonImmutable::parse($athlete->joined_at->toDateString());
        $effectiveStart = $athleteJoined->greaterThan($windowStart)
            ? $athleteJoined
            : $windowStart;

        $rangeStart = $windowStart->toDateString();
        $rangeEnd = $today->toDateString();

        // Empty short-circuit: if joined_at is past today (defensive — the
        // backfill on athletes.joined_at is `today` by default), there are
        // no realized lesson days for this athlete.
        if ($effectiveStart->greaterThan($today)) {
            return [
                'range_days' => $rangeDays,
                'range_start' => $rangeStart,
                'range_end' => $rangeEnd,
                'attended_count' => 0,
                'expected_count' => 0,
                'rate' => null,
                'series' => [],
            ];
        }

        // All distinct lesson dates (any athlete in the academy) inside
        // the clipped window. One query, ordered ASC so the series array
        // is sparkline-ready without a re-sort.
        $lessonDates = AttendanceRecord::query()
            ->whereHas('athlete', static fn ($q) => $q->where('academy_id', $athlete->academy_id))
            ->whereDate('attended_on', '>=', $effectiveStart->toDateString())
            ->whereDate('attended_on', '<=', $rangeEnd)
            ->orderBy('attended_on')
            ->distinct()
            ->get(['attended_on'])
            ->map(static fn (AttendanceRecord $r): string => $r->attended_on->toDateString())
            ->unique()
            ->values()
            ->all();

        // Dates THIS athlete attended (within the clipped window). Flipped
        // to a set so the series-build join below stays O(N).
        $attendedDates = AttendanceRecord::query()
            ->where('athlete_id', $athlete->id)
            ->whereDate('attended_on', '>=', $effectiveStart->toDateString())
            ->whereDate('attended_on', '<=', $rangeEnd)
            ->get(['attended_on'])
            ->map(static fn (AttendanceRecord $r): string => $r->attended_on->toDateString())
            ->flip()
            ->all();

        $series = [];
        $attendedCount = 0;
        foreach ($lessonDates as $date) {
            $isAttended = isset($attendedDates[$date]);
            if ($isAttended) {
                $attendedCount++;
            }
            $series[] = ['date' => $date, 'attended' => $isAttended];
        }

        $expectedCount = \count($lessonDates);
        $rate = $expectedCount === 0
            ? null
            : round($attendedCount / $expectedCount, 4);

        return [
            'range_days' => $rangeDays,
            'range_start' => $rangeStart,
            'range_end' => $rangeEnd,
            'attended_count' => $attendedCount,
            'expected_count' => $expectedCount,
            'rate' => $rate,
            'series' => $series,
        ];
    }
}
