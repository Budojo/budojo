<?php

declare(strict_types=1);

namespace App\Actions\Lesson;

use App\Enums\ClassKind;
use App\Enums\TopicKind;
use App\Models\Academy;
use App\Models\AcademyClass;
use App\Models\Lesson;
use App\Models\SyllabusTopic;
use App\Support\Season;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * What to teach tonight (#1566).
 *
 * The coverage view (#1565) is a report: you open it when you sit down to
 * think about the season. This is the same data answering the question at the
 * moment it is actually asked — on the mat, ten minutes before class. That
 * difference is what turns a screen an owner visits twice into one they use
 * every week.
 *
 * **Three rules, in order, and the answer says which one fired.** No model, no
 * score. A suggestion whose reasoning is invisible gets ignored; one that says
 * why gets trusted or overruled on the merits, and both of those beat a
 * mystery.
 *
 *   1. Never taught this season, in programme order — so a block of work stays
 *      coherent instead of jumping across the syllabus.
 *   2. Taught once, oldest first — the things at risk of being called done on
 *      the strength of a single evening.
 *   3. Least recently taught, when everything in season has been covered
 *      twice. An academy that is on top of its programme still gets an answer.
 *
 * "This season" and "held" mean exactly what they mean in
 * `SyllabusCoverageAction`, deliberately: a topic the chart calls thin and the
 * suggestion calls covered would make one of the two screens a liar. A test
 * pins the two together rather than trusting this comment.
 */
class SuggestLessonTopicsAction
{
    /** Taught in at least this many held lessons to count as covered. */
    private const COVERED_AT = 2;

    /**
     * @return list<array{
     *     id: int,
     *     name: string,
     *     parent_name: string|null,
     *     kind: string,
     *     reason: string,
     *     last_taught_on: string|null,
     * }>
     */
    public function execute(Academy $academy, AcademyClass $class, int $limit = 3): array
    {
        $reference = CarbonImmutable::now();
        $start = Season::startFor($academy, $reference);
        $end = Season::endFor($academy, $reference);

        $techniques = $this->techniquesInScope($academy, $class->kind);

        if ($techniques->isEmpty()) {
            return [];
        }

        $positions = $this->positions($academy);
        $taught = $this->taughtInSeason($academy, $start, $end);

        $never = [];
        $thin = [];
        $stale = [];

        foreach ($techniques as $technique) {
            $lessons = $taught[$technique->id]['lessons'] ?? 0;
            $last = $taught[$technique->id]['last'] ?? null;

            $parent = $positions->get($technique->parent_id ?? 0);
            $row = [
                'id' => $technique->id,
                'name' => $technique->name,
                'parent_name' => $parent instanceof SyllabusTopic ? $parent->name : null,
                'kind' => $technique->kind->value,
                'reason' => 'never',
                'last_taught_on' => $last,
                // Sort keys only; stripped before the list is returned.
                '_order' => [
                    $parent instanceof SyllabusTopic ? $parent->sort_order : 0,
                    $technique->sort_order,
                ],
            ];

            if ($lessons === 0) {
                $never[] = $row;
            } elseif ($lessons < self::COVERED_AT) {
                $row['reason'] = 'thin';
                $thin[] = $row;
            } else {
                $row['reason'] = 'stale';
                $stale[] = $row;
            }
        }

        // Rule 1 reads in programme order, because a coherent block of work is
        // the point. Rules 2 and 3 read oldest-first, because there the
        // question is which thing has waited longest.
        usort($never, static fn (array $a, array $b): int => $a['_order'] <=> $b['_order']);
        usort($thin, self::oldestFirst(...));
        usort($stale, self::oldestFirst(...));

        $picked = \array_slice([...$never, ...$thin, ...$stale], 0, max(0, $limit));

        return array_map(static function (array $row): array {
            unset($row['_order']);

            return $row;
        }, $picked);
    }

    /**
     * Oldest first, with the programme order breaking a tie — two topics last
     * taught the same evening should not come back in an order that changes
     * between requests.
     *
     * @param  array<string, mixed>  $a
     * @param  array<string, mixed>  $b
     */
    private static function oldestFirst(array $a, array $b): int
    {
        return [$a['last_taught_on'], $a['_order']] <=> [$b['last_taught_on'], $b['_order']];
    }

    /**
     * The techniques this class could be told to teach: living, in season, and
     * of a kind the class admits.
     *
     * A `gi` class is never told to teach a no-gi leg entanglement, and vice
     * versa. `both` and `other` admit everything — `other` is a seminar or an
     * open mat, not a statement about the uniform.
     *
     * @return Collection<int, SyllabusTopic>
     */
    private function techniquesInScope(Academy $academy, ClassKind $kind): Collection
    {
        $admitted = match ($kind) {
            ClassKind::Gi => [TopicKind::Gi->value, TopicKind::Both->value],
            ClassKind::NoGi => [TopicKind::NoGi->value, TopicKind::Both->value],
            ClassKind::Both, ClassKind::Other => null,
        };

        return SyllabusTopic::query()
            ->where('academy_id', $academy->id)
            ->where('in_season', true)
            ->whereNotNull('parent_id')
            ->when($admitted !== null, static fn ($q) => $q->whereIn('kind', $admitted))
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();
    }

    /**
     * Every living position, keyed by id — the source of the names and of the
     * programme order, never a thing to suggest. "Teach closed guard tonight"
     * is not an answer; "teach the omoplata from closed guard" is.
     *
     * @return Collection<int, SyllabusTopic>
     */
    private function positions(Academy $academy): Collection
    {
        return SyllabusTopic::query()
            ->where('academy_id', $academy->id)
            ->positions()
            ->get()
            ->keyBy('id');
    }

    /**
     * How many held lessons named each topic this season, and when it was last
     * on the mat.
     *
     * The same definition `SyllabusCoverageAction` uses: only lessons somebody
     * was checked into, only this season, and only up to today — a topic on
     * next Wednesday's plan has not been taught, and suggesting against it
     * would tell the instructor to skip the very thing they just planned.
     *
     * @return array<int, array{lessons: int, last: string}>
     */
    private function taughtInSeason(Academy $academy, CarbonImmutable $start, CarbonImmutable $end): array
    {
        $today = CarbonImmutable::today()->toDateString();
        $until = $end->toDateString() < $today ? $end->toDateString() : $today;

        $rows = DB::table('lesson_topic')
            ->join('lessons', 'lessons.id', '=', 'lesson_topic.lesson_id')
            ->whereIn('lesson_topic.lesson_id', Lesson::query()
                ->where('academy_id', $academy->id)
                ->whereBetween('held_on', [$start->toDateString(), $until])
                ->whereHas('attendanceRecords')
                ->select('id'))
            ->groupBy('lesson_topic.syllabus_topic_id')
            ->get([
                'lesson_topic.syllabus_topic_id as topic_id',
                DB::raw('COUNT(DISTINCT lessons.id) as lesson_count'),
                DB::raw('MAX(lessons.held_on) as last_held'),
            ]);

        $taught = [];
        foreach ($rows as $row) {
            $topicId = is_numeric($row->topic_id) ? (int) $row->topic_id : 0;
            $taught[$topicId] = [
                'lessons' => is_numeric($row->lesson_count) ? (int) $row->lesson_count : 0,
                // `held_on` arrives as `Y-m-d` from SQLite and may carry a time
                // from MySQL's DATE handling; both compare correctly once cut.
                'last' => substr((string) $row->last_held, 0, 10),
            ];
        }

        return $taught;
    }
}
