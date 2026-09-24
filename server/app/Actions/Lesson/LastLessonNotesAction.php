<?php

declare(strict_types=1);

namespace App\Actions\Lesson;

use App\Models\Lesson;
use App\Models\SyllabusTopic;

class LastLessonNotesAction
{
    /**
     * The latest evening that taught this topic and left notes (#1862).
     *
     * Lesson notes are about the evening — "Marco's first day back" — and are
     * never parsed into topics (#1564). This does not parse them either. It
     * finds the latest **held** lesson that named the topic and carried notes,
     * and hands that lesson back whole, so the reader sees them as the notes
     * of that evening, with its date and its class, and never as notes on the
     * technique.
     *
     * Held means somebody was checked in, the definition every coverage read
     * uses: a plan for next week that already says "add the belly-down
     * finish" did not happen, and must not read as the last time.
     */
    public function execute(SyllabusTopic $topic): ?Lesson
    {
        /** @var Lesson|null $lesson */
        $lesson = Lesson::query()
            ->where('academy_id', $topic->academy_id)
            ->whereHas('topics', static fn ($q) => $q->whereKey($topic->id))
            ->whereHas('attendanceRecords')
            ->whereNotNull('notes')
            ->whereRaw("TRIM(notes) <> ''")
            ->orderByDesc('held_on')
            ->orderByDesc('starts_at')
            ->orderByDesc('id')
            ->with('topics.parent')
            ->first();

        return $lesson;
    }
}
