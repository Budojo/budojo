<?php

declare(strict_types=1);

namespace App\Actions\Lesson;

use App\Models\Lesson;
use App\Models\SyllabusTopic;
use Carbon\CarbonImmutable;

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
     *
     * And "last" means **before** the evening being looked at. The sheet is
     * open on a day; that day's lesson — a plan whose note becomes held the
     * moment somebody is checked in — is this evening, not the last one, and
     * answering with it would hide the real previous notes behind tonight's.
     * Two classes on the same earlier evening: the later one answers.
     */
    public function execute(SyllabusTopic $topic, CarbonImmutable $before): ?Lesson
    {
        /** @var Lesson|null $lesson */
        $lesson = Lesson::query()
            ->where('academy_id', $topic->academy_id)
            ->whereDate('held_on', '<', $before->toDateString())
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
