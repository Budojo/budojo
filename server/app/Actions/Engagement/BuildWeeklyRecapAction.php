<?php

declare(strict_types=1);

namespace App\Actions\Engagement;

use App\Models\Athlete;
use App\Models\AttendanceRecord;
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
 * The mat-hour estimate is a flat `sessions × 1.5h` per the M4 PRD
 * assumption (every academy session = ~90 minutes). Future per-
 * academy `session_duration_minutes` setting can replace the constant
 * when it lands.
 */
class BuildWeeklyRecapAction
{
    private const float HOURS_PER_SESSION = 1.5;
    private const int MAX_PARTNERS = 3;

    public function execute(Athlete $athlete, CarbonImmutable $isoWeekStart): WeeklyRecapResult
    {
        $weekStart = $isoWeekStart->startOfDay();
        $weekEnd = $weekStart->addDays(6)->endOfDay();

        $athleteRows = AttendanceRecord::query()
            ->where('athlete_id', $athlete->id)
            ->whereBetween('attended_on', [$weekStart->toDateString(), $weekEnd->toDateString()])
            ->get(['attended_on'])
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
            ->orderBy('partner.first_name')
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
            hours: $sessions * self::HOURS_PER_SESSION,
            partners: $partnerList,
        );
    }
}
