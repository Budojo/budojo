<?php

declare(strict_types=1);

namespace App\Actions\Academy;

use App\Exceptions\PendingScheduleAlreadyExistsException;
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
 * Wrapped in a transaction because the single-pending-future invariant
 * has to be enforced race-safely. `execute()` opens the transaction,
 * takes a `lockForUpdate()` exclusive lock on the owning academy row,
 * re-checks for an existing pending row inside the lock, and inserts
 * only if none exists. Two simultaneous POSTs serialize on the academy
 * row; the second surfaces `PendingScheduleAlreadyExistsException`
 * which the controller translates to a 422 with the validation-error
 * shape (so the FE handles "already pending" the same as any other
 * per-field 422 on bad payloads).
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
            // Race-safe single-pending-future invariant. Without a row
            // lock + transaction, two near-simultaneous POSTs from the
            // same owner (multi-tab, retried request) can both pass an
            // unlocked existence check and both insert. Locking the
            // owning academy row serializes them on the row; the second
            // POST sees the just-inserted row and throws an exception
            // the controller translates to 422. Same pattern the
            // gotchas memory has flagged on the addresses upsert.
            Academy::query()->whereKey($academy->id)->lockForUpdate()->first();

            $hasPending = $academy->schedules()
                ->where('effective_from', '>', Carbon::today()->toDateString())
                ->exists();
            if ($hasPending) {
                throw new PendingScheduleAlreadyExistsException(
                    'A pending future schedule already exists. Cancel it before scheduling another.',
                );
            }

            /** @var AcademySchedule $schedule */
            $schedule = $academy->schedules()->create([
                'training_days' => $trainingDays,
                'effective_from' => $effectiveFrom->toDateString(),
            ]);

            return $schedule;
        });
    }
}
