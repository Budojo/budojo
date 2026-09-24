<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Who was in the room when a topic was taught (#1745).
 *
 * The join the programme's per-person reads all make —
 * `lesson_topic ⋈ lessons ⋈ attendance_records` — written once. The
 * technique drill-down (#1745) reads one topic's column of it; "tonight, for
 * the people on the mat" (#1860) reads many topics against the people checked
 * in; the headcount beside each taught row (#1746) sums it.
 *
 * **Held means the same thing it means everywhere else**: a lesson with at
 * least one live presence (`SyllabusCoverageAction`, `LessonResource.held`). A
 * lesson planned and never checked into names topics and taught nobody, so it
 * contributes neither a row nor a headcount.
 *
 * **One evening is one exposure.** A lesson tagged with a technique and its
 * position is still one evening on the mat, so everything here is counted by
 * distinct lesson and distinct athlete, never by join row.
 */
final class TopicAttendance
{
    /**
     * The held lessons in `[$from, $to]` that named any of `$topicIds`, oldest
     * first, each with the distinct athletes whose live presence points at it.
     *
     * Keyed by topic id. A topic that was not taught is absent from the
     * result, not present with an empty list.
     *
     * @param  list<int>  $topicIds
     * @return array<int, list<array{id: int, held_on: string, name: string, kind: string, starts_at: string|null, athlete_ids: list<int>}>>
     */
    public function lessonsFor(int $academyId, array $topicIds, string $from, string $to): array
    {
        if ($topicIds === []) {
            return [];
        }

        $rows = DB::table('lesson_topic')
            ->join('lessons', 'lessons.id', '=', 'lesson_topic.lesson_id')
            ->where('lessons.academy_id', $academyId)
            ->whereIn('lesson_topic.syllabus_topic_id', $topicIds)
            ->whereBetween('lessons.held_on', [$from, $to])
            ->whereExists(static function ($query): void {
                $query->select(DB::raw(1))
                    ->from('attendance_records')
                    ->whereColumn('attendance_records.lesson_id', 'lessons.id')
                    ->whereNull('attendance_records.deleted_at');
            })
            ->orderBy('lessons.held_on')
            ->orderBy('lessons.starts_at')
            ->orderBy('lessons.id')
            ->get([
                'lesson_topic.syllabus_topic_id as topic_id',
                'lessons.id as id',
                'lessons.held_on as held_on',
                'lessons.name as name',
                'lessons.kind as kind',
                'lessons.starts_at as starts_at',
            ]);

        if ($rows->isEmpty()) {
            return [];
        }

        $lessonIds = array_values(array_unique(
            $rows->map(static fn (object $row): int => is_numeric($row->id) ? (int) $row->id : 0)->all(),
        ));
        $present = $this->athletesPresentAt($lessonIds);

        $out = [];
        foreach ($rows as $row) {
            $lessonId = is_numeric($row->id) ? (int) $row->id : 0;
            $topicId = is_numeric($row->topic_id) ? (int) $row->topic_id : 0;
            $out[$topicId][] = [
                'id' => $lessonId,
                // `held_on` arrives as `Y-m-d` from SQLite and may carry a
                // time from MySQL's DATE handling; both compare once cut.
                'held_on' => substr(\is_string($row->held_on) ? $row->held_on : '', 0, 10),
                'name' => \is_string($row->name) ? $row->name : '',
                'kind' => \is_string($row->kind) ? $row->kind : '',
                'starts_at' => \is_string($row->starts_at) ? $row->starts_at : null,
                'athlete_ids' => $present[$lessonId] ?? [],
            ];
        }

        return $out;
    }

    /**
     * Lesson id → the distinct athletes with a live presence on it.
     *
     * @param  list<int>  $lessonIds
     * @return array<int, list<int>>
     */
    private function athletesPresentAt(array $lessonIds): array
    {
        $rows = DB::table('attendance_records')
            ->whereIn('lesson_id', $lessonIds)
            ->whereNull('deleted_at')
            ->distinct()
            ->orderBy('lesson_id')
            ->orderBy('athlete_id')
            ->get(['lesson_id', 'athlete_id']);

        $out = [];
        foreach ($rows as $row) {
            $out[is_numeric($row->lesson_id) ? (int) $row->lesson_id : 0][]
                = is_numeric($row->athlete_id) ? (int) $row->athlete_id : 0;
        }

        return $out;
    }
}
