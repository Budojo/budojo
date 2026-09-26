<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\AcademyClosure;
use App\Models\AcademySchedule;
use App\Support\AttendanceSummaryCache;

/**
 * A closure or a schedule row changed, so every athlete's attendance
 * denominator did too (#1769): the cached summaries stop being read.
 */
class ForgetsAttendanceSummaries
{
    public function saved(AcademyClosure|AcademySchedule $model): void
    {
        AttendanceSummaryCache::forgetAcademy($model->academy_id);
    }

    public function deleted(AcademyClosure|AcademySchedule $model): void
    {
        AttendanceSummaryCache::forgetAcademy($model->academy_id);
    }
}
