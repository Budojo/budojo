<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Enums\TopicKind;
use App\Models\Academy;
use App\Models\Lesson;
use App\Models\SyllabusTopic;
use App\Support\Season;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class SyllabusCoverageAction
{
    /** Taught in at least this many held lessons to count as covered. */
    private const COVERED_AT = 2;

    /**
     * What the academy has covered this season, what it has barely touched,
     * and what it has not taught at all (#1565).
     *
     * The request that started the epic, and the reason the three issues
     * before it exist: a chart of raw tag counts is decoration, a chart
     * against the academy's own programme inside its own season is a
     * teaching plan.
     *
     * Three states rather than one percentage, because **covered takes two**.
     * Teaching something once in September and calling it done is exactly the
     * self-deception this screen exists to prevent, so one lesson is `thin`,
     * not `covered`.
     *
     * Only **held** lessons count: a lesson planned and never checked into
     * contributes nothing (#1564). Only `in_season` topics count, and only
     * the ones the kind filter admits — a `gi` topic is not counted against a
     * no-gi academy, and the denominator moves with the filter, not just the
     * numerator. A number that quietly mixes the two is worse than no number.
     *
     * **Positions are not in the denominator.** The programme's top level is
     * a chapter heading, and "have I covered closed guard" is answered by how
     * many of its techniques were taught, not by the heading. Tagging a
     * position is still a real answer — "we worked half guard" — so it is
     * counted and reported per position as `worked`, next to the bar, rather
     * than thrown away or allowed to stand in for the techniques under it.
     *
     * @return array<string, mixed>
     */
    public function execute(Academy $academy, int $seasonsBack = 0, ?TopicKind $kind = null): array
    {
        $reference = CarbonImmutable::now()->subYears($seasonsBack);
        $start = Season::startFor($academy, $reference);
        $end = Season::endFor($academy, $reference);

        $topics = $this->topicsInScope($academy, $kind);
        $positions = $topics->filter(static fn (SyllabusTopic $t): bool => $t->parent_id === null)->keyBy('id');
        $techniques = $topics->filter(static fn (SyllabusTopic $t): bool => $t->parent_id !== null);

        $taught = $this->taughtInSeason($academy, $start, $end);

        return [
            'season' => [
                'start' => $start->toDateString(),
                'end' => $end->toDateString(),
                'label' => Season::labelFor($academy, $reference),
            ],
            'kind' => $kind?->value,
            ...$this->report($techniques, $positions, $taught, $start, $end),
        ];
    }

    /**
     * The programme as this report counts it: living, in season, and of a
     * kind the filter admits. `both` is admitted by every filter — it is the
     * default a topic carries when it makes sense either way.
     *
     * @return Collection<int, SyllabusTopic>
     */
    private function topicsInScope(Academy $academy, ?TopicKind $kind): Collection
    {
        return SyllabusTopic::query()
            ->where('academy_id', $academy->id)
            ->where('in_season', true)
            ->when($kind !== null, static fn ($q) => $q->whereIn('kind', [$kind?->value, TopicKind::Both->value]))
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();
    }

    /**
     * Every (topic, lesson day) this season, from held lessons only.
     *
     * Fetched whole rather than aggregated in SQL because the timeline needs
     * the day a topic reached its *second* lesson, which no aggregate can
     * answer — and a season of one academy is a few hundred rows.
     *
     * @return array<int, array{lessons: int, last: string, second: string|null}>
     */
    private function taughtInSeason(Academy $academy, CarbonImmutable $start, CarbonImmutable $end): array
    {
        $heldLessonIds = Lesson::query()
            ->where('academy_id', $academy->id)
            ->whereBetween('held_on', [$start->toDateString(), $end->toDateString()])
            ->whereHas('attendanceRecords')
            ->pluck('id');

        if ($heldLessonIds->isEmpty()) {
            return [];
        }

        $rows = DB::table('lesson_topic')
            ->join('lessons', 'lessons.id', '=', 'lesson_topic.lesson_id')
            ->whereIn('lesson_topic.lesson_id', $heldLessonIds)
            ->orderBy('lessons.held_on')
            ->get(['lesson_topic.syllabus_topic_id as topic_id', 'lessons.held_on as held_on']);

        /** @var array<int, list<string>> $days */
        $days = [];
        foreach ($rows as $row) {
            $topicId = is_numeric($row->topic_id) ? (int) $row->topic_id : 0;
            // `held_on` arrives as `Y-m-d` from SQLite and may carry a time
            // from MySQL's DATE handling; both compare correctly once cut.
            $days[$topicId][] = substr((string) $row->held_on, 0, 10);
        }

        $taught = [];
        foreach ($days as $topicId => $dates) {
            sort($dates);
            $taught[$topicId] = [
                'lessons' => \count($dates),
                'last' => $dates[\count($dates) - 1],
                'second' => $dates[self::COVERED_AT - 1] ?? null,
            ];
        }

        return $taught;
    }

    /**
     * @param  Collection<int, SyllabusTopic>  $techniques
     * @param  Collection<int, SyllabusTopic>  $positions
     * @param  array<int, array{lessons: int, last: string, second: string|null}>  $taught
     * @return array<string, mixed>
     */
    private function report(
        Collection $techniques,
        Collection $positions,
        array $taught,
        CarbonImmutable $start,
        CarbonImmutable $end,
    ): array {
        $covered = 0;
        $thin = 0;
        $missing = [];
        $done = [];
        /** @var array<int, array{covered: int, thin: int, missing: int}> $byPosition */
        $byPosition = [];

        foreach ($techniques as $technique) {
            $lessons = $taught[$technique->id]['lessons'] ?? 0;
            $state = $lessons >= self::COVERED_AT ? 'covered' : ($lessons === 1 ? 'thin' : 'missing');

            $parentId = $technique->parent_id ?? 0;
            $byPosition[$parentId] ??= ['covered' => 0, 'thin' => 0, 'missing' => 0];
            $byPosition[$parentId][$state]++;

            if ($state === 'covered') {
                $covered++;
            } elseif ($state === 'thin') {
                $thin++;
            } else {
                $missing[] = [
                    'id' => $technique->id,
                    'name' => $technique->name,
                    'parent_name' => $positions->get($parentId)?->name,
                    'kind' => $technique->kind->value,
                ];
            }

            if ($lessons > 0) {
                $done[] = [
                    'id' => $technique->id,
                    'name' => $technique->name,
                    'parent_name' => $positions->get($parentId)?->name,
                    'kind' => $technique->kind->value,
                    'lessons' => $lessons,
                    'last_taught_on' => $taught[$technique->id]['last'],
                    'state' => $state,
                ];
            }
        }

        // Most recently taught first: the panel answers "didn't I just do
        // armbars?", which is a question about recency, not about the order
        // of the programme.
        usort($done, static fn (array $a, array $b): int => strcmp(
            (string) $b['last_taught_on'],
            (string) $a['last_taught_on'],
        ));

        $inScope = $techniques->count();

        return [
            'totals' => [
                'in_scope' => $inScope,
                'covered' => $covered,
                'thin' => $thin,
                'missing' => \count($missing),
                // Integer percent of the denominator, and 0 rather than a
                // division by zero for an academy with no programme yet.
                'percentage' => $inScope === 0 ? 0 : (int) round(($covered / $inScope) * 100),
            ],
            'positions' => $this->positionRows($positions, $byPosition, $taught),
            'missing' => $missing,
            'taught' => $done,
            'timeline' => $this->timeline($techniques, $taught, $start, $end),
        ];
    }

    /**
     * One row per position that has anything in scope under it. A position
     * with nothing left in season is not a bar with no segments — it is not
     * part of this season's plan at all, and drawing it would say otherwise.
     *
     * @param  Collection<int, SyllabusTopic>  $positions
     * @param  array<int, array{covered: int, thin: int, missing: int}>  $byPosition
     * @param  array<int, array{lessons: int, last: string, second: string|null}>  $taught
     * @return list<array<string, mixed>>
     */
    private function positionRows(Collection $positions, array $byPosition, array $taught): array
    {
        $rows = [];

        foreach ($positions as $position) {
            $counts = $byPosition[$position->id] ?? null;
            if ($counts === null) {
                continue;
            }

            $rows[] = [
                'id' => $position->id,
                'name' => $position->name,
                'kind' => $position->kind->value,
                'in_scope' => $counts['covered'] + $counts['thin'] + $counts['missing'],
                'covered' => $counts['covered'],
                'thin' => $counts['thin'],
                'missing' => $counts['missing'],
                // How many held lessons named the position itself — "we
                // worked half guard", an answer that fills no technique but
                // is not nothing either.
                'worked' => $taught[$position->id]['lessons'] ?? 0,
            ];
        }

        return $rows;
    }

    /**
     * Covered topics week by week, cumulative — whether the season is on
     * pace or drifting.
     *
     * A topic joins the count on the day of its **second** lesson, because
     * that is the day it became covered by the same rule the headline uses.
     * Two different definitions of "covered" on one screen would be a chart
     * arguing with its own number.
     *
     * @param  Collection<int, SyllabusTopic>  $techniques
     * @param  array<int, array{lessons: int, last: string, second: string|null}>  $taught
     * @return list<array{on: string, covered: int}>
     */
    private function timeline(Collection $techniques, array $taught, CarbonImmutable $start, CarbonImmutable $end): array
    {
        $seconds = [];
        foreach ($techniques as $technique) {
            $second = $taught[$technique->id]['second'] ?? null;
            if ($second !== null) {
                $seconds[] = $second;
            }
        }
        sort($seconds);

        // The season stops at today: drawing a flat line into next June says
        // the academy has stopped teaching, which is not what an empty future
        // means.
        $last = CarbonImmutable::today()->lessThan($end) ? CarbonImmutable::today() : $end;

        $points = [];
        $cursor = $start->endOfWeek();
        $index = 0;
        $running = 0;

        while ($cursor->lessThanOrEqualTo($last)) {
            $on = $cursor->toDateString();
            while ($index < \count($seconds) && $seconds[$index] <= $on) {
                $running++;
                $index++;
            }
            $points[] = ['on' => $on, 'covered' => $running];
            $cursor = $cursor->addWeek();
        }

        // A season that has only just started still gets one point, so the
        // chart has a line rather than an axis.
        if ($points === []) {
            $points[] = ['on' => $last->toDateString(), 'covered' => $running];
        }

        return $points;
    }
}
