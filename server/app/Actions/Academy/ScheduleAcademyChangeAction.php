<?php

declare(strict_types=1);

namespace App\Actions\Academy;

use App\Models\Academy;
use App\Models\AcademySchedule;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Schedules a future `training_days` change (#1094 PR 2).
 *
 * Splits the write into two coupled side-effects:
 *   1. Insert a new `academy_schedules` row with `effective_from > today`.
 *   2. Leave the legacy `academies.training_days` column UNCHANGED —
 *      it's the "current schedule" cache, and the change isn't current
 *      yet. The cache flips at the canonical PATCH endpoint or on the
 *      day-of via a future scheduled job (out of scope for PR 2 —
 *      until then, the FE consumer rewrite in PR 3 reads the history,
 *      so the user-visible behaviour is correct even with a stale
 *      column).
 *
 * Wrapped in a transaction for symmetry with the other Academy actions
 * even though it's a single insert — keeps the canon ("Action owns the
 * full unit of work") tidy.
 *
 * The single-pending-future invariant lives in the FormRequest, not
 * here — same `validate()` boundary as the rest of the surface.
 */
class ScheduleAcademyChangeAction
{
    /**
     * @param  list<int>|null  $trainingDays  Carbon dayOfWeek ints (0=Sun..6=Sat); null = "not configured" for this period.
     */
    public function execute(
        Academy $academy,
        ?array $trainingDays,
        Carbon $effectiveFrom,
    ): AcademySchedule {
        return DB::transaction(function () use ($academy, $trainingDays, $effectiveFrom): AcademySchedule {
            /** @var AcademySchedule $schedule */
            $schedule = $academy->schedules()->create([
                'training_days' => $trainingDays,
                'effective_from' => $effectiveFrom->toDateString(),
            ]);

            return $schedule;
        });
    }
}
