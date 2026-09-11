<?php

declare(strict_types=1);

namespace App\Actions\Lesson;

use App\Models\AcademyClass;
use App\Models\Lesson;
use Carbon\CarbonImmutable;

/**
 * The lesson for a class on a date — found if it exists, created if not
 * (#1562).
 *
 * This is the one place a lesson comes into being, and it happens the first
 * time somebody is checked into it. The class's name, time and kind are
 * copied onto the row here and never re-read: the timetable is mutable and
 * the past is not.
 *
 * `firstOrCreate` rather than a check-then-insert of our own, because the
 * check-in fires one POST per tap and two taps in quick succession arrive
 * together. Both would see no lesson and both would insert; the unique index
 * on `(academy_class_id, held_on)` rejects the second, and Laravel's
 * `firstOrCreate` catches exactly that violation and re-reads the winner.
 */
class MaterialiseLessonAction
{
    public function execute(AcademyClass $class, CarbonImmutable $date): Lesson
    {
        return Lesson::query()->firstOrCreate(
            [
                'academy_class_id' => $class->id,
                'held_on' => $date->toDateString(),
            ],
            [
                'academy_id' => $class->academy_id,
                'name' => $class->name,
                'starts_at' => $class->starts_at,
                'kind' => $class->kind,
            ],
        );
    }
}
