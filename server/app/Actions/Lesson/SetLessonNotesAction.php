<?php

declare(strict_types=1);

namespace App\Actions\Lesson;

use App\Models\AcademyClass;
use App\Models\Lesson;
use Carbon\CarbonImmutable;

class SetLessonNotesAction
{
    public function __construct(
        private readonly MaterialiseLessonAction $materialiseLesson,
    ) {
    }

    /**
     * The free-text note on a lesson (#1564) — "Marco's first day back", not
     * data entry. It is never parsed into topics: the two answer different
     * questions and conflating them is how a tag list fills with prose.
     *
     * An empty note is stored as `null` rather than as an empty string, so
     * "has a note" is one check everywhere and not two.
     */
    public function execute(AcademyClass $class, CarbonImmutable $date, ?string $notes): Lesson
    {
        $lesson = $this->materialiseLesson->execute($class, $date);

        $trimmed = $notes === null ? null : trim($notes);
        $lesson->notes = $trimmed === '' ? null : $trimmed;
        $lesson->save();

        return $lesson;
    }
}
