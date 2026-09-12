<?php

declare(strict_types=1);

namespace App\Actions\Lesson;

use App\Models\AcademyClass;
use App\Models\Lesson;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class SetLessonTopicsAction
{
    public function __construct(
        private readonly MaterialiseLessonAction $materialiseLesson,
    ) {
    }

    /**
     * Says what a lesson covers (#1564) — ahead of time as a plan, after the
     * fact as a record, and the same list either way.
     *
     * The lesson is materialised here when it does not exist, which is how
     * planning works at all: until #1564 a lesson came into being only on the
     * first check-in. A planned lesson is therefore a row with topics and no
     * attendance, and that is precisely what "planned, not held" looks like —
     * nothing needs to store the distinction.
     *
     * `sync()` rather than attach/detach: the caller sends the list it wants,
     * and the composite primary key makes a repeat of the same list a no-op.
     * Ownership is the request's job — by the time this runs every id belongs
     * to this academy's living programme.
     *
     * Links to topics that have **left** the programme survive that sync.
     * They cannot be in the incoming list — the request refuses a trashed id,
     * because a topic out of the syllabus should not be newly attachable —
     * so a sync of what the picker offers would quietly drop them, and
     * editing tonight's list would rewrite what March said. Carrying them
     * through is what makes "the lesson keeps naming it" true under editing
     * and not just under reading.
     *
     * @param  list<int>  $topicIds
     */
    public function execute(AcademyClass $class, CarbonImmutable $date, array $topicIds): Lesson
    {
        return DB::transaction(function () use ($class, $date, $topicIds): Lesson {
            $lesson = $this->materialiseLesson->execute($class, $date);

            $gone = $lesson->topics()
                ->whereNotNull('syllabus_topics.deleted_at')
                ->pluck('syllabus_topics.id')
                ->map(static fn (mixed $id): int => is_numeric($id) ? (int) $id : 0)
                ->all();

            $lesson->topics()->sync(array_values(array_unique([...$topicIds, ...$gone])));

            return $lesson->load('topics');
        });
    }
}
