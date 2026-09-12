<?php

declare(strict_types=1);

namespace App\Actions\Lesson;

use App\Models\Academy;
use App\Models\SyllabusTopic;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class RecentLessonTopicsAction
{
    /**
     * What this academy has been teaching lately (#1564), most recent first.
     *
     * The picker's second group, and the one that does most of the work:
     * teaching runs in blocks, so the thing taught last Monday is very often
     * the thing being taught tonight. Without it the answer is two hundred
     * names and a search box.
     *
     * Living topics only, and held days only — a topic out of the programme
     * is not offered again (the lessons that already name it keep saying so),
     * and one on a future plan has not been taught yet.
     *
     * @return Collection<int, SyllabusTopic>
     */
    public function execute(Academy $academy, int $limit = 12): Collection
    {
        // Group by the selected column alone, so the query is safe under
        // MySQL's ONLY_FULL_GROUP_BY as well as SQLite's laxer reading.
        //
        // Both filters sit *before* the limit, or the cap would silently
        // shrink: twelve rows fetched and then thinned is a group of eight.
        // And the group says "taught lately", so it reads the past only — a
        // topic on next Wednesday's plan has not been taught at all, and
        // would otherwise sort straight to the top of it.
        $ids = DB::table('lesson_topic')
            ->join('lessons', 'lessons.id', '=', 'lesson_topic.lesson_id')
            ->join('syllabus_topics', 'syllabus_topics.id', '=', 'lesson_topic.syllabus_topic_id')
            ->where('lessons.academy_id', $academy->id)
            ->where('lessons.held_on', '<=', CarbonImmutable::today()->toDateString())
            ->whereNull('syllabus_topics.deleted_at')
            ->groupBy('lesson_topic.syllabus_topic_id')
            ->orderByRaw('MAX(lessons.held_on) DESC')
            ->limit($limit)
            ->pluck('lesson_topic.syllabus_topic_id')
            ->map(static fn (mixed $id): int => is_numeric($id) ? (int) $id : 0)
            ->all();

        if ($ids === []) {
            return collect();
        }

        // Re-ordered in PHP: `whereIn` returns primary-key order, and the
        // order here is the answer, not an accident of the fetch.
        $byId = SyllabusTopic::query()
            ->where('academy_id', $academy->id)
            ->whereIn('id', $ids)
            ->with('parent')
            ->get()
            ->keyBy('id');

        /** @var Collection<int, SyllabusTopic> $ordered */
        $ordered = collect($ids)
            ->map(static fn (int $id) => $byId->get($id))
            ->filter()
            ->values();

        return $ordered;
    }
}
