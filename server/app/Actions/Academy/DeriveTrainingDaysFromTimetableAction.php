<?php

declare(strict_types=1);

namespace App\Actions\Academy;

use App\Models\Academy;

/**
 * The training days ARE the days with a class on the timetable (#1575).
 *
 * Since #1562 an academy said when it trains in two places — the weekday
 * pills on its form and the classes on its timetable — and nothing tied them
 * together. Classes on Mon/Wed/Fri with the pills left on Tue/Thu greyed the
 * wrong days out of the check-in's date picker and counted the wrong days in
 * the attendance denominator. One source of truth: while the timetable has
 * classes, the pills follow it.
 *
 * Runs after every class is saved or deleted. An academy with no classes is
 * left alone — its owner keeps the pills by hand, exactly as before the
 * timetable existed — and deleting the last class leaves the days where they
 * were rather than blanking them: a timetable taken down is not a claim that
 * nobody trains.
 */
class DeriveTrainingDaysFromTimetableAction
{
    public function __construct(
        private readonly RecordTrainingDaysAction $recordTrainingDays,
    ) {
    }

    public function execute(Academy $academy): void
    {
        /** @var list<int> $fromTimetable */
        $fromTimetable = $academy->classes()
            ->distinct()
            ->orderBy('weekday')
            ->pluck('weekday')
            ->map(static fn (mixed $day): int => is_numeric($day) ? (int) $day : 0)
            ->values()
            ->all();

        if ($fromTimetable === []) {
            return;
        }

        $current = $academy->training_days ?? [];
        sort($current);
        if ($current === $fromTimetable) {
            return;
        }

        // Same trace the owner's own PATCH leaves: the column, and a history
        // row dated today, so the past keeps the schedule it actually had.
        $this->recordTrainingDays->execute($academy, $fromTimetable);
    }
}
