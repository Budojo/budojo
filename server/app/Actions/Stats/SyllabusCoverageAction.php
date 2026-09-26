<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Enums\TrainingMode;
use App\Models\Academy;
use App\Models\SyllabusTopic;
use App\Support\OperatorDay;
use App\Support\Season;
use App\Support\TopicAttendance;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

class SyllabusCoverageAction
{
    /** Taught in at least this many held lessons to count as covered. */
    private const COVERED_AT = 2;

    public function __construct(
        private readonly TopicAttendance $attendance,
    ) {
    }

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
    public function execute(Academy $academy, int $seasonsBack = 0, ?TrainingMode $kind = null): array
    {
        $reference = OperatorDay::today()->subYears($seasonsBack);
        $start = Season::startFor($academy, $reference);
        $end = Season::endFor($academy, $reference);

        // Techniques are the denominator; positions are the grouping, and
        // they are loaded **unfiltered** on purpose. A technique can be in
        // season under a position that is not (adding one never re-ticks its
        // parent), and `both` survives a `gi` filter under a `gi` position —
        // so filtering the grouping too would leave in-scope techniques with
        // no bar to sit in and no name to print, and the bars would stop
        // summing to the total.
        $techniques = $this->topicsInScope($academy, $kind)
            ->filter(static fn (SyllabusTopic $t): bool => $t->parent_id !== null);
        $positions = $this->positions($academy);

        // The techniques in scope, and every position for its `worked` count.
        $topicIds = array_values(array_unique(array_merge(
            $techniques->map(static fn (SyllabusTopic $t): int => $t->id)->all(),
            array_keys($positions->all()),
        )));
        $taught = $this->taughtInSeason($academy, $topicIds, $start, $end);

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
     * default a topic carries when it makes sense either way. The same rule as
     * a lesson's suggestions, {@see TrainingMode::admittedTopicModes()}.
     *
     * @return Collection<int, SyllabusTopic>
     */
    private function topicsInScope(Academy $academy, ?TrainingMode $kind): Collection
    {
        $admitted = $kind?->admittedTopicModes();

        return SyllabusTopic::query()
            ->where('academy_id', $academy->id)
            ->where('in_season', true)
            ->when($admitted !== null, static fn ($q) => $q->whereIn('kind', $admitted))
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();
    }

    /**
     * Every living position, in programme order — the grouping and the source
     * of the names, never the denominator.
     *
     * @return Collection<int, SyllabusTopic>
     */
    private function positions(Academy $academy): Collection
    {
        return SyllabusTopic::query()
            ->where('academy_id', $academy->id)
            ->positions()
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get()
            ->keyBy('id');
    }

    /**
     * What each topic's held lessons this season add up to.
     *
     * Read through {@see TopicAttendance}, the one place the join from a topic
     * to the people in the room is written, so "held" here is the same held
     * the drill-down (#1745) and tonight's room (#1860) use. Taken whole, not
     * aggregated in SQL: reach needs the people behind each lesson, and a
     * season of one academy is a few hundred rows.
     *
     * **Reach is people, attendances are presences (#1746).** Three evenings
     * of fifteen and three of four both read `lessons: 3`; `reach` — distinct
     * athletes at one or more of them — is what tells them apart, and
     * `attendances` — distinct (athlete, lesson) pairs — is what makes a
     * `reach` counted as rows fail a test instead of passing for a number.
     *
     * @param  list<int>  $topicIds
     * @return array<int, array{lessons: int, last: string, reach: int, attendances: int}>
     */
    private function taughtInSeason(Academy $academy, array $topicIds, CarbonImmutable $start, CarbonImmutable $end): array
    {
        $byTopic = $this->attendance->lessonsFor(
            $academy->id,
            $topicIds,
            $start->toDateString(),
            $end->toDateString(),
        );

        $taught = [];
        foreach ($byTopic as $topicId => $lessons) {
            // Oldest first, as `TopicAttendance` returns them.
            $dates = array_column($lessons, 'held_on');
            $people = array_column($lessons, 'athlete_ids');
            $taught[$topicId] = [
                'lessons' => \count($lessons),
                'last' => $dates[\count($dates) - 1],
                'reach' => \count(array_unique(array_merge(...$people))),
                'attendances' => array_sum(array_map('count', $people)),
            ];
        }

        return $taught;
    }

    /**
     * @param  Collection<int, SyllabusTopic>  $techniques
     * @param  Collection<int, SyllabusTopic>  $positions
     * @param  array<int, array{lessons: int, last: string, reach: int, attendances: int}>  $taught
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
            $parent = $positions->get($parentId);
            $parentOrder = $parent instanceof SyllabusTopic ? $parent->sort_order : 0;
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
                    // By id, for the map to group under (#1911): names
                    // repeat across positions, and a name is not a key.
                    'parent_id' => $technique->parent_id,
                    'parent_name' => $parent?->name,
                    'kind' => $technique->kind->value,
                    // Sort key only; stripped before the list is returned.
                    '_order' => [$parentOrder, $technique->sort_order],
                ];
            }

            if ($lessons > 0) {
                $done[] = [
                    'id' => $technique->id,
                    'name' => $technique->name,
                    'parent_id' => $technique->parent_id,
                    'parent_name' => $parent?->name,
                    'kind' => $technique->kind->value,
                    'lessons' => $lessons,
                    // A column beside `lessons`, never a second fraction and
                    // never a threshold: covered still takes two lessons,
                    // whoever was in them (#1746).
                    'reach' => $taught[$technique->id]['reach'],
                    'attendances' => $taught[$technique->id]['attendances'],
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

        // `sort_order` is numbered per parent, so a flat list sorted by it
        // alone ping-pongs between positions on consecutive rows. This is the
        // list an instructor reads top to bottom; it reads in programme order.
        usort($missing, static fn (array $a, array $b): int => $a['_order'] <=> $b['_order']);
        $missing = array_map(static function (array $row): array {
            unset($row['_order']);

            return $row;
        }, $missing);

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
        ];
    }

    /**
     * One row per position that has anything in scope under it. A position
     * with nothing left in season is not a bar with no segments — it is not
     * part of this season's plan at all, and drawing it would say otherwise.
     *
     * @param  Collection<int, SyllabusTopic>  $positions
     * @param  array<int, array{covered: int, thin: int, missing: int}>  $byPosition
     * @param  array<int, array{lessons: int, last: string, reach: int, attendances: int}>  $taught
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
}
