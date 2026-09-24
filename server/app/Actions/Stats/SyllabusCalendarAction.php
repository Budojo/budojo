<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Enums\TrainingMode;
use App\Models\Academy;
use App\Models\Lesson;
use App\Models\SyllabusTopic;
use App\Support\Season;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

class SyllabusCalendarAction
{
    /**
     * Each position, week by week, across a season (#1858).
     *
     * The coverage report answers **how much** of a position has been taught.
     * This answers **when**: half guard in October and never again is a gap a
     * fraction cannot show, and it is the gap a programme is planned around.
     *
     * A cell counts the distinct lessons that week which named the position
     * **or any of its techniques**: the union, deliberately. The `worked`
     * count in `SyllabusCoverageAction` is the position tag alone, because
     * there it sits beside a fraction of techniques; here the question is
     * whether the area was on the mat that week at all, and "we did the armbar
     * from closed guard" answers it as much as "we worked closed guard" does.
     * The per-technique drill-down (#1745) keeps the two apart.
     *
     * Techniques count by the report's own rules (living, `in_season`, and
     * admitted by the filter), so a row's weeks and the fraction printed at
     * its end never disagree about what counts. A position named on its own
     * counts under every filter, as `worked` does.
     *
     * Three states, none stored (`docs/entities/lesson.md`):
     *   - **held**: at least one live presence points at the lesson;
     *   - **planned**: nobody checked in, dated today or later;
     *   - **unconfirmed**: nobody checked in, and the day has passed. Not
     *     taught, and not a failure either: the plan was never confirmed.
     *
     * @return array<string, mixed>
     */
    public function execute(Academy $academy, int $seasonsBack = 0, ?TrainingMode $kind = null): array
    {
        $reference = CarbonImmutable::now()->subYears($seasonsBack);
        $start = Season::startFor($academy, $reference);
        $end = Season::endFor($academy, $reference);
        $today = CarbonImmutable::today()->toDateString();

        $positions = $this->positions($academy);
        $positionOf = $this->positionOfEachCountedTopic($academy, $positions, $kind);

        /** @var array<int, array<string, array{held: int, planned: int, unconfirmed: int}>> $cells */
        $cells = [];
        $lessons = [];

        foreach ($this->taggedLessons($academy, $start, $end) as $lesson) {
            $heldOn = $lesson->held_on->toDateString();
            $state = $this->stateOf($lesson, $heldOn, $today);
            $positionIds = $this->positionsCountedBy($lesson, $positionOf);

            $week = self::mondayOf(CarbonImmutable::parse($heldOn))->toDateString();
            foreach ($positionIds as $positionId) {
                $cells[$positionId][$week] ??= ['held' => 0, 'planned' => 0, 'unconfirmed' => 0];
                $cells[$positionId][$week][$state]++;
            }

            $lessons[] = [
                'id' => $lesson->id,
                'academy_class_id' => $lesson->academy_class_id,
                'held_on' => $heldOn,
                'name' => $lesson->name,
                'starts_at' => $lesson->starts_at,
                'kind' => $lesson->kind->value,
                'state' => $state,
                'position_ids' => $positionIds,
                'topics' => $lesson->topics->map(static fn (SyllabusTopic $t): array => [
                    'id' => $t->id,
                    'name' => $t->name,
                    'parent_id' => $t->parent_id,
                ])->values()->all(),
            ];
        }

        return [
            'season' => [
                'start' => $start->toDateString(),
                'end' => $end->toDateString(),
                'label' => Season::labelFor($academy, $reference),
            ],
            'kind' => $kind?->value,
            // The server's today, so the client marks "this week" on the same
            // calendar the states were computed against.
            'today' => $today,
            'weeks' => $this->weeks($start, $end),
            'positions' => $this->positionRows($positions, $cells),
            'lessons' => $lessons,
        ];
    }

    /**
     * Every living position, in programme order.
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
     * topic id → the position a lesson naming it counts for.
     *
     * A position counts for itself under every filter. A technique counts for
     * its position when the coverage report would count it: living, in season,
     * and of a kind the filter admits ({@see TrainingMode::admittedTopicModes()}).
     *
     * @param  Collection<int, SyllabusTopic>  $positions
     * @return array<int, int>
     */
    private function positionOfEachCountedTopic(Academy $academy, Collection $positions, ?TrainingMode $kind): array
    {
        $map = [];
        foreach ($positions as $position) {
            $map[$position->id] = $position->id;
        }

        $admitted = $kind?->admittedTopicModes();

        $techniques = SyllabusTopic::query()
            ->where('academy_id', $academy->id)
            ->whereNotNull('parent_id')
            ->where('in_season', true)
            ->when($admitted !== null, static fn ($q) => $q->whereIn('kind', $admitted))
            ->get(['id', 'parent_id']);

        foreach ($techniques as $technique) {
            $parentId = $technique->parent_id;
            // A technique whose position is gone has nowhere on the map to be.
            if ($parentId !== null && $positions->has($parentId)) {
                $map[$technique->id] = $parentId;
            }
        }

        return $map;
    }

    /**
     * The season's lessons that carry at least one topic, oldest first, each
     * with whether anybody was checked into it.
     *
     * `withExists` goes through the relation, so the soft-delete scope on
     * attendance applies: a presence corrected away does not make a lesson
     * held, as in the coverage report's `whereHas`.
     *
     * @return Collection<int, Lesson>
     */
    private function taggedLessons(Academy $academy, CarbonImmutable $start, CarbonImmutable $end): Collection
    {
        return Lesson::query()
            ->where('academy_id', $academy->id)
            ->whereBetween('held_on', [$start->toDateString(), $end->toDateString()])
            ->whereHas('topics')
            ->withExists('attendanceRecords as is_held')
            ->with('topics')
            ->orderBy('held_on')
            ->orderBy('starts_at')
            ->orderBy('id')
            ->get();
    }

    /**
     * Held, planned or unconfirmed. Today counts as ahead: tonight's lesson
     * with nobody checked in yet has not happened, it has not been missed.
     *
     * @return 'held'|'planned'|'unconfirmed'
     */
    private function stateOf(Lesson $lesson, string $heldOn, string $today): string
    {
        if ((bool) $lesson->getAttribute('is_held')) {
            return 'held';
        }

        return $heldOn >= $today ? 'planned' : 'unconfirmed';
    }

    /**
     * The distinct positions a lesson counts for: two techniques of one
     * position on one evening are one lesson on that position, not two.
     *
     * @param  array<int, int>  $positionOf
     * @return list<int>
     */
    private function positionsCountedBy(Lesson $lesson, array $positionOf): array
    {
        $positionIds = [];
        foreach ($lesson->topics as $topic) {
            $positionId = $positionOf[$topic->id] ?? null;
            if ($positionId !== null && ! \in_array($positionId, $positionIds, true)) {
                $positionIds[] = $positionId;
            }
        }

        return $positionIds;
    }

    /**
     * @param  Collection<int, SyllabusTopic>  $positions
     * @param  array<int, array<string, array{held: int, planned: int, unconfirmed: int}>>  $cells
     * @return list<array{id: int, name: string, kind: string, cells: list<array{week: string, held: int, planned: int, unconfirmed: int}>}>
     */
    private function positionRows(Collection $positions, array $cells): array
    {
        $rows = [];
        foreach ($positions as $position) {
            $weeks = $cells[$position->id] ?? [];
            ksort($weeks);

            $positionCells = [];
            foreach ($weeks as $week => $counts) {
                $positionCells[] = ['week' => (string) $week, ...$counts];
            }

            $rows[] = [
                'id' => $position->id,
                'name' => $position->name,
                'kind' => $position->kind->value,
                'cells' => $positionCells,
            ];
        }

        return $rows;
    }

    /**
     * The Monday of every week the season touches. The first one can fall
     * before the season opens; that is the column its first days sit in.
     *
     * @return list<string>
     */
    private function weeks(CarbonImmutable $start, CarbonImmutable $end): array
    {
        $weeks = [];
        for ($cursor = self::mondayOf($start); $cursor->lessThanOrEqualTo($end); $cursor = $cursor->addWeek()) {
            $weeks[] = $cursor->toDateString();
        }

        return $weeks;
    }

    /**
     * ISO Monday, computed rather than asked of `startOfWeek()`, whose first
     * day depends on the locale in Carbon 3.
     */
    private static function mondayOf(CarbonImmutable $day): CarbonImmutable
    {
        return $day->startOfDay()->subDays($day->dayOfWeekIso - 1);
    }
}
