<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\AcademyClosure;
use App\Models\AcademySchedule;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Support\AttendanceSummaryCache;

/**
 * Something the attendance summary is made of changed, so the cached answers
 * stop being read (#1769): a closure or a schedule row moves every athlete's
 * denominator, a presence marked or removed moves a numerator, and a joining
 * date corrected moves where an athlete's window starts. Without the last
 * two, the calendar showed a change at once and the ring five minutes later.
 */
class ForgetsAttendanceSummaries
{
    public function saved(AcademyClosure|AcademySchedule|AttendanceRecord|Athlete $model): void
    {
        // An athlete's other fields are not in the summary.
        if ($model instanceof Athlete && ! $model->wasChanged('joined_at')) {
            return;
        }
        $this->forget($model);
    }

    public function deleted(AcademyClosure|AcademySchedule|AttendanceRecord|Athlete $model): void
    {
        $this->forget($model);
    }

    public function restored(AttendanceRecord|Athlete $model): void
    {
        $this->forget($model);
    }

    private function forget(AcademyClosure|AcademySchedule|AttendanceRecord|Athlete $model): void
    {
        $academyId = $model instanceof AttendanceRecord
            ? $model->athlete()->withTrashed()->value('academy_id')
            : $model->academy_id;

        if (\is_int($academyId)) {
            AttendanceSummaryCache::forgetAcademy($academyId);
        }
    }
}
