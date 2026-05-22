<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

use App\Enums\AttendanceSource;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use Carbon\Carbon;
use Carbon\CarbonImmutable;

/**
 * Self-mark today's presence for one athlete (#960). Three branches:
 *
 *  - `Created` — new row, source=self.
 *  - `Existed` — a row already exists for today; returned as-is
 *    WITHOUT flipping source (an instructor-marked row stays
 *    instructor-marked — the self-mark is a no-op).
 *  - `NotTrainingDay` — today's weekday isn't in the academy's
 *    `training_days`; nothing was written.
 *
 * The action centralises the training-day rule + the idempotent
 * fetch + the delegation to `MarkAttendanceAction`. The controller
 * only maps the three branches to HTTP statuses.
 */
class MarkTodayAttendanceAction
{
    public function __construct(
        private readonly MarkAttendanceAction $markAttendance,
    ) {
    }

    public function execute(Athlete $athlete): MarkTodayResult
    {
        $academy = $athlete->academy;
        // FK athletes.academy_id is NOT NULL — every athlete row
        // belongs to an academy at the schema level. The relation
        // type-hint is nullable to cover the "model loaded without
        // relation" case which is impossible here (we fetch via
        // `$user->athlete` from the auth pipeline).
        \assert($academy !== null);

        if (! $this->isTrainingDayToday($academy)) {
            return MarkTodayResult::notTrainingDay();
        }

        $today = CarbonImmutable::today();
        $existing = AttendanceRecord::query()
            ->where('athlete_id', $athlete->id)
            ->whereDate('attended_on', $today->toDateString())
            ->first();
        if ($existing !== null) {
            return MarkTodayResult::existed($existing);
        }

        $created = $this->markAttendance->execute(
            $academy,
            $today,
            [$athlete->id],
            AttendanceSource::Self,
        )->first();
        // Single-id call + idempotent-fetch guarantee above guarantee
        // the collection has exactly one item — PHPStan can't follow
        // that, hence the narrowing.
        \assert($created instanceof AttendanceRecord);

        return MarkTodayResult::created($created);
    }

    /**
     * Today's weekday is in the academy's configured `training_days`.
     * Null / empty `training_days` → no schedule configured → today
     * does not count as a training day (returns false). The owner has
     * to explicitly populate the schedule for self-mark to be legal.
     */
    private function isTrainingDayToday(\App\Models\Academy $academy): bool
    {
        /** @var list<int>|null $trainingDays */
        $trainingDays = $academy->training_days;
        if ($trainingDays === null || $trainingDays === []) {
            return false;
        }

        return \in_array((int) Carbon::today()->dayOfWeek, $trainingDays, true);
    }
}
