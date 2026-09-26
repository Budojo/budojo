<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\AcademyClosure;
use App\Models\AcademySchedule;
use App\Models\AttendanceRecord;
use App\Support\AttendanceSummaryCache;

/**
 * Something the attendance summary is made of changed, so the cached answers
 * stop being read (#1769): a closure or a schedule row moves every athlete's
 * denominator, and a presence marked or removed moves a numerator. Without
 * the last one, a tick made on the check-in page showed on the calendar at
 * once and on the ring five minutes later.
 */
class ForgetsAttendanceSummaries
{
    public function saved(AcademyClosure|AcademySchedule|AttendanceRecord $model): void
    {
        $this->forget($model);
    }

    public function deleted(AcademyClosure|AcademySchedule|AttendanceRecord $model): void
    {
        $this->forget($model);
    }

    public function restored(AttendanceRecord $model): void
    {
        $this->forget($model);
    }

    private function forget(AcademyClosure|AcademySchedule|AttendanceRecord $model): void
    {
        $academyId = $model instanceof AttendanceRecord
            ? $model->athlete()->withTrashed()->value('academy_id')
            : $model->academy_id;

        if (\is_int($academyId)) {
            AttendanceSummaryCache::forgetAcademy($academyId);
        }
    }
}
