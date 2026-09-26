<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Support\ScheduledDays;
use Carbon\CarbonImmutable;

class GetAthleteAttendanceSummaryAction
{
    /**
     * How often one athlete trained in a window (#893): the last 30, 90 or
     * 365 days for the card, or a calendar month for the ring (#1769).
     *
     * **Divided by the days the academy was scheduled to train** (#1769),
     * closures out, nothing after today (`ScheduledDays`), the rule every
     * attendance number in the app now shares. It used to divide by
     * "realised lesson days", every date anyone in the academy was checked
     * in, which made one athlete's denominator depend on other people: an
     * open mat on a Sunday added a day everybody else had missed, and a
     * session the owner forgot to register vanished from everyone's count.
     * The honest cost of the new rule is that such a forgotten session now
     * counts against everyone, which is the correct trade: a denominator
     * that flexes with data entry cannot be compared month to month.
     *
     * **The window starts** at its own first day, or later at the day the
     * athlete joined, unless they trained before joining (trial sessions
     * entered after registering): then at that first presence. The same
     * start as the month summary and the roster, so one athlete reads the
     * same everywhere.
     *
     * **Every day they trained counts**, scheduled or not: an open mat is
     * real training, so the rate may pass 1 and is not clamped. The series
     * has one entry per scheduled day, plus any other day they trained.
     *
     * Null denominator and rate when no schedule was ever configured.
     *
     * @return array{
     *   range_days: int,
     *   range_start: string,
     *   range_end: string,
     *   window_start: string,
     *   attended_count: int,
     *   expected_count: int|null,
     *   rate: float|null,
     *   series: list<array{date: string, attended: bool}>
     * }
     */
    public function execute(Athlete $athlete, CarbonImmutable $windowStart, CarbonImmutable $windowEnd): array
    {
        $today = CarbonImmutable::today();
        $windowStart = $windowStart->startOfDay();
        $windowEnd = $windowEnd->startOfDay();
        $last = $windowEnd->min($today);

        // Every day trained in the window counts: the start never passes the
        // first presence, so none of them falls before it.
        $attended = $this->daysTrained($athlete, $windowStart, $last);
        $start = $this->startOf($athlete, $windowStart, $attended);

        $academy = $athlete->academy;
        \assert($academy !== null);
        $scheduled = ScheduledDays::between($academy, $start, $last, $today);
        $expected = $scheduled === null ? null : \count($scheduled);

        return [
            'range_days' => (int) $windowStart->diffInDays($windowEnd) + 1,
            'range_start' => $windowStart->toDateString(),
            'range_end' => $windowEnd->toDateString(),
            // Where this athlete's window begins, so the calendar paints no
            // day before it as missed.
            'window_start' => $start->toDateString(),
            'attended_count' => \count($attended),
            'expected_count' => $expected,
            'rate' => $expected === null || $expected === 0 ? null : round(\count($attended) / $expected, 4),
            'series' => $this->series($scheduled ?? [], $attended),
        ];
    }

    /**
     * The distinct days this athlete trained in the window, ascending. The
     * SoftDeletes scope keeps a corrected presence out.
     *
     * @return list<string>
     */
    private function daysTrained(Athlete $athlete, CarbonImmutable $from, CarbonImmutable $to): array
    {
        if ($from->greaterThan($to)) {
            return [];
        }

        return array_values(AttendanceRecord::query()
            ->where('athlete_id', $athlete->id)
            ->whereDate('attended_on', '>=', $from->toDateString())
            ->whereDate('attended_on', '<=', $to->toDateString())
            ->get(['attended_on'])
            ->map(static fn (AttendanceRecord $r): string => $r->attended_on->toDateString())
            ->unique()
            ->sort()
            ->all());
    }

    /** @param list<string> $attended */
    private function startOf(Athlete $athlete, CarbonImmutable $windowStart, array $attended): CarbonImmutable
    {
        $start = CarbonImmutable::parse($athlete->joined_at->toDateString());
        if ($attended !== [] && $attended[0] < $start->toDateString()) {
            $start = CarbonImmutable::parse($attended[0]);
        }

        return $start->max($windowStart);
    }

    /**
     * One entry per scheduled day, plus any other day they trained, oldest
     * first, so the strip is drawable without a re-sort.
     *
     * @param  list<string>  $scheduled
     * @param  list<string>  $attended
     * @return list<array{date: string, attended: bool}>
     */
    private function series(array $scheduled, array $attended): array
    {
        $trained = array_flip($attended);
        $days = array_unique([...$scheduled, ...$attended]);
        sort($days);

        return array_map(
            static fn (string $day): array => ['date' => $day, 'attended' => isset($trained[$day])],
            $days,
        );
    }
}
