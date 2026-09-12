<?php

declare(strict_types=1);

namespace App\Actions\Academy;

use App\Models\Academy;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;

/**
 * "This is the schedule starting today" — the one way training days change.
 *
 * Two writers now share it (#1575): the owner's PATCH, and the timetable,
 * which derives the days from its classes. Both have to leave the same trace:
 * the denormalised `academies.training_days` for every reader that wants
 * "now", and a row in `academy_schedules` dated today for every reader that
 * wants "then" (#1094) — the expected-attendance denominators are computed
 * against the schedule that was in force on each past day, and a change
 * that skipped the history would quietly rewrite them.
 */
class RecordTrainingDaysAction
{
    /**
     * One save, not a dedicated `update()`: whatever the caller has already
     * filled on the model — the rest of a PATCH — goes down with the days,
     * so a Save that changes the name and the days leaves one audit entry,
     * as it did before the days had an Action of their own.
     *
     * @param  list<int>|null  $trainingDays  Carbon dayOfWeek ints, ascending; null = not configured
     */
    public function execute(Academy $academy, ?array $trainingDays): void
    {
        $this->upsertTodaySchedule($academy, $trainingDays);
        $academy->training_days = $trainingDays;
        $academy->save();
    }

    /**
     * Race-safe upsert of the today-row in `academy_schedules`. The
     * read-then-write shape of `updateOrCreate` against the
     * `UNIQUE(academy_id, effective_from)` constraint isn't serialised
     * by the enclosing transaction — two concurrent writes from the
     * same user (double-tap on Save, SPA retry after a 502) can both
     * SELECT-miss, both INSERT, and one explodes with a
     * UniqueConstraintViolation. Try the insert, fall through to an
     * UPDATE on the duplicate-key path — second write wins,
     * idempotently. Same shape as the gotchas-flagged `addresses`
     * upsert.
     *
     * @param  list<int>|null  $trainingDays
     */
    private function upsertTodaySchedule(Academy $academy, ?array $trainingDays): void
    {
        $today = Carbon::today()->toDateString();

        try {
            $academy->schedules()->create([
                'training_days' => $trainingDays,
                'effective_from' => $today,
            ]);
        } catch (QueryException) {
            $academy->schedules()
                ->where('effective_from', $today)
                ->update(['training_days' => $trainingDays]);
        }
    }
}
