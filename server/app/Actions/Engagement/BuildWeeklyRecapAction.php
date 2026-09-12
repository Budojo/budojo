<?php

declare(strict_types=1);

namespace App\Actions\Engagement;

use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\Lesson;
use App\Support\MatHours;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * Aggregate one athlete's last-7-days attendance for the Sunday-evening
 * weekly recap push (#960). Returns a small record-shape DTO the
 * SPA + notification template both consume — keeps the loop tight
 * over the same Eloquent query.
 *
 * Window: Monday 00:00 → Sunday 23:59 local (ISO week boundary).
 * Top training partners: athletes from the same academy who shared
 * ≥1 attended_on day with the recap athlete in the window, ranked
 * by overlap count desc, capped at 3.
 *
 * Mat hours are summed from the lessons the week's presences name
 * (#1591), falling back to ninety minutes for one that names none.
 * The old flat `sessions × 1.5h` came from the M4 PRD and could not
 * be moved by any input the owner had.
 */
class BuildWeeklyRecapAction
{
    private const int MAX_PARTNERS = 3;

    public function execute(Athlete $athlete, CarbonImmutable $isoWeekStart): WeeklyRecapResult
    {
        $weekStart = $isoWeekStart->startOfDay();
        $weekEnd = $weekStart->addDays(6)->endOfDay();

        $presences = AttendanceRecord::query()
            ->where('athlete_id', $athlete->id)
            ->whereBetween('attended_on', [$weekStart->toDateString(), $weekEnd->toDateString()])
            // Eager, or summing the durations below is one query per presence.
            ->with('lesson:id,duration_minutes')
            ->get(['attended_on', 'lesson_id']);

        $athleteRows = $presences
            ->pluck('attended_on')
            ->map(function (mixed $d): string {
                if ($d instanceof CarbonInterface) {
                    return $d->toDateString();
                }

                // attendance_records.attended_on is cast to `date:Y-m-d`
                // on the model, so the only non-Carbon path here would
                // be a fresh-from-array unhydrated row (test edge).
                return \is_string($d) ? $d : '';
            })
            ->unique()
            ->values();

        $sessions = $athleteRows->count();
        if ($sessions === 0) {
            return new WeeklyRecapResult(
                isoWeekStart: $weekStart->toDateString(),
                sessions: 0,
                hours: 0.0,
                partners: [],
            );
        }

        // Summed per presence, not per day: two classes on one evening is one
        // session on purpose, and two hours all the same (#1591).
        $minutes = (int) $presences->sum(static function (AttendanceRecord $record): int {
            // Hoisted rather than `?->duration_minutes ?? …`: the relation's
            // declared type is non-null, so PHPStan calls the nullsafe
            // unnecessary even though `lesson_id` is nullable.
            $lesson = $record->lesson;

            return $lesson instanceof Lesson
                ? ($lesson->duration_minutes ?? MatHours::FALLBACK_MINUTES)
                : MatHours::FALLBACK_MINUTES;
        });

        // Top partners — athletes from the same academy who shared
        // any of the same attended_on dates this week. Excludes self.
        // The aggregation is intentionally per-day, NOT per-row: a
        // partner who happened to be marked twice on the same date
        // (data hygiene edge case) doesn't outrank an athlete who
        // overlapped on 3 distinct days.
        $partners = AttendanceRecord::query()
            ->join('athletes as partner', 'partner.id', '=', 'attendance_records.athlete_id')
            ->where('partner.academy_id', $athlete->academy_id)
            ->where('partner.id', '!=', $athlete->id)
            ->whereIn('attendance_records.attended_on', $athleteRows->all())
            ->selectRaw('partner.id, partner.first_name, partner.last_name, COUNT(DISTINCT attendance_records.attended_on) as overlap')
            ->groupBy('partner.id', 'partner.first_name', 'partner.last_name')
            ->orderByDesc('overlap')
            // Same as the leaderboard (#1527): a `LIMIT` over a tied count
            // makes the name collation decide who appears at all.
            ->orderBy('partner.first_name_sort')
            ->orderBy('partner.id')
            ->limit(self::MAX_PARTNERS)
            ->get()
            ->map(function (AttendanceRecord $row): array {
                // The selectRaw above maps partner.first_name / .last_name
                // onto the AttendanceRecord model attributes (Eloquent
                // doesn't care about the source table — it just hydrates
                // selected columns by name).
                $firstName = \is_string($row->getAttribute('first_name'))
                    ? $row->getAttribute('first_name')
                    : '';
                $lastName = \is_string($row->getAttribute('last_name'))
                    ? $row->getAttribute('last_name')
                    : '';

                return [
                    'first_name' => $firstName,
                    'last_name_initial' => $lastName !== ''
                        ? mb_strtoupper(mb_substr($lastName, 0, 1))
                        : '',
                ];
            })
            ->values()
            ->all();
        // Re-index narrows the collection's array<int, T> back into
        // a `list<T>` for the DTO contract — PHPStan keeps the wider
        // signature otherwise.
        $partnerList = array_values($partners);

        return new WeeklyRecapResult(
            isoWeekStart: $weekStart->toDateString(),
            sessions: $sessions,
            hours: MatHours::fromMinutes($minutes),
            partners: $partnerList,
        );
    }
}
