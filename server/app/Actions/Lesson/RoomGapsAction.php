<?php

declare(strict_types=1);

namespace App\Actions\Lesson;

use App\Models\Academy;
use App\Models\AcademyClass;
use App\Models\Athlete;
use App\Models\Lesson;
use App\Models\SyllabusTopic;
use App\Support\Season;
use App\Support\TopicAttendance;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Tonight, for the people on the mat (#1860).
 *
 * The suggestions (#1566) answer from the academy's side: never taught this
 * season, taught once, least recently taught. They cannot see who is in the
 * room. Once the check-in is done, this answers the question an instructor
 * asks when choosing a recap — *who is here, and what did they miss?* — which
 * no paper register can.
 *
 * A candidate is a technique in scope for the class (in season, of a kind the
 * class admits) that the academy taught in at least one held lesson this
 * season **before tonight**. For each, "missed" counts the people checked in
 * tonight who were at none of those lessons and had joined by the last of
 * them. It is offered only when most of the room missed it — at least two
 * people and at least half — and at most three come back, the most missed
 * first, then the one that has waited longest.
 *
 * **It sharpens the suggestions rather than repeating them.** A technique
 * taught twice counts as covered there; if seven of tonight's nine never saw
 * it, it is still worth teaching again. A technique nobody has taught is rule
 * one's job and never appears here.
 *
 * **Not a list of who is behind.** The names come back in register order and
 * the count is per technique, never per person. A presence that names no
 * lesson (#1590) on one of those days is not read as an absence: that person
 * is left out of `missed` and counted in `unattributed` instead.
 */
class RoomGapsAction
{
    /** Fewer people than this is a private lesson, not a room to read. */
    private const MIN_PRESENT = 3;

    /** Missed by at least this many, and by at least half of the room. */
    private const MIN_MISSED = 2;

    private const LIMIT = 3;

    public function __construct(
        private readonly TopicAttendance $attendance,
    ) {
    }

    /**
     * @return array{present: int, rows: list<array<string, mixed>>}
     */
    public function execute(Academy $academy, AcademyClass $class, CarbonImmutable $heldOn): array
    {
        $present = $this->presentTonight($class, $heldOn);
        if (\count($present) < self::MIN_PRESENT) {
            return ['present' => \count($present), 'rows' => []];
        }

        $techniques = $this->techniquesInScope($academy, $class);
        $taught = $this->attendance->lessonsFor(
            $academy->id,
            array_values($techniques->keys()->all()),
            Season::startFor($academy, $heldOn)->toDateString(),
            // Tonight is the lesson being planned, not one anybody missed.
            $heldOn->subDay()->toDateString(),
        );
        $unattributed = $this->unattributedDays(array_keys($present), $taught);

        $rows = [];
        foreach ($taught as $topicId => $lessons) {
            $technique = $techniques->get($topicId);
            if (! $technique instanceof SyllabusTopic) {
                continue;
            }

            $row = $this->gapFor($technique, $lessons, $present, $unattributed);
            if ($row['missed'] >= self::MIN_MISSED && $row['missed'] * 2 >= \count($present)) {
                $rows[] = $row;
            }
        }

        usort($rows, static fn (array $a, array $b): int => [$b['missed'], $a['last_taught_on'], $a['_order']]
            <=> [$a['missed'], $b['last_taught_on'], $b['_order']]);

        return [
            'present' => \count($present),
            'rows' => array_map(static function (array $row): array {
                unset($row['_order']);

                return $row;
            }, \array_slice($rows, 0, self::LIMIT)),
        ];
    }

    /**
     * One technique against the room.
     *
     * @param  list<array{id: int, held_on: string, name: string, kind: string, starts_at: string|null, athlete_ids: list<int>}>  $lessons
     * @param  array<int, Athlete>  $present
     * @param  array<int, list<string>>  $unattributed  athlete id → days they trained with no lesson named
     * @return array{id: int, name: string, parent_name: string|null, kind: string, lessons: int, last_taught_on: string, missed: int, unattributed: int, athletes: list<array<string, mixed>>, _order: array{int, int}}
     */
    private function gapFor(SyllabusTopic $technique, array $lessons, array $present, array $unattributed): array
    {
        $days = array_column($lessons, 'held_on');
        $last = $days[\count($days) - 1];
        $there = array_fill_keys(array_merge(...array_column($lessons, 'athlete_ids')), true);

        $missed = [];
        $unsure = 0;
        foreach ($present as $athleteId => $athlete) {
            if (isset($there[$athleteId]) || $athlete->joined_at->toDateString() > $last) {
                continue;
            }
            if (array_intersect($unattributed[$athleteId] ?? [], $days) !== []) {
                // Trained on one of those days, at a lesson the record cannot
                // name. Could have been this one: said, never counted.
                $unsure++;

                continue;
            }
            $missed[] = $athlete;
        }

        $parent = $technique->parent;

        return [
            'id' => $technique->id,
            'name' => $technique->name,
            'parent_name' => $parent instanceof SyllabusTopic ? $parent->name : null,
            'kind' => $technique->kind->value,
            'lessons' => \count($lessons),
            'last_taught_on' => $last,
            'missed' => \count($missed),
            'unattributed' => $unsure,
            'athletes' => array_map(static fn (Athlete $a): array => [
                'id' => $a->id,
                'first_name' => $a->first_name,
                'last_name' => $a->last_name,
                'belt' => $a->belt->value,
                'stripes' => $a->stripes,
                'date_of_birth' => $a->date_of_birth?->toDateString(),
                'photo_url' => $a->photo_url,
                'user_avatar_url' => $a->user?->avatar_url,
            ], $missed),
            // Sort key only; stripped before the rows are returned.
            '_order' => [$parent instanceof SyllabusTopic ? $parent->sort_order : 0, $technique->sort_order],
        ];
    }

    /**
     * The athletes with a live presence on tonight's lesson, keyed by id, in
     * register order. No lesson in the slot, or nobody checked into it, is an
     * empty room.
     *
     * @return array<int, Athlete>
     */
    private function presentTonight(AcademyClass $class, CarbonImmutable $heldOn): array
    {
        $lesson = Lesson::query()
            ->where('academy_class_id', $class->id)
            ->whereDate('held_on', $heldOn->toDateString())
            ->first();

        if (! $lesson instanceof Lesson) {
            return [];
        }

        return Athlete::query()
            ->whereIn('id', DB::table('attendance_records')
                ->where('lesson_id', $lesson->id)
                ->whereNull('deleted_at')
                ->select('athlete_id'))
            ->with('user')
            ->orderBy('last_name_sort')
            ->orderBy('first_name_sort')
            ->orderBy('id')
            ->get()
            ->keyBy('id')
            ->all();
    }

    /**
     * What the class could be told to teach: living, in season, a technique
     * and not a position, of a kind the class admits — the suggestions' own
     * scope ({@see SuggestLessonTopicsAction}).
     *
     * @return Collection<int, SyllabusTopic>
     */
    private function techniquesInScope(Academy $academy, AcademyClass $class): Collection
    {
        $admitted = $class->kind->admittedTopicModes();

        return SyllabusTopic::query()
            ->where('academy_id', $academy->id)
            ->where('in_season', true)
            ->whereNotNull('parent_id')
            ->when($admitted !== null, static fn ($q) => $q->whereIn('kind', $admitted))
            ->with('parent')
            ->get()
            ->keyBy('id');
    }

    /**
     * For the people in the room, the days on which one of these techniques
     * was taught that they trained without the record naming a lesson.
     *
     * @param  list<int>  $athleteIds
     * @param  array<int, list<array{id: int, held_on: string, name: string, kind: string, starts_at: string|null, athlete_ids: list<int>}>>  $taught
     * @return array<int, list<string>>
     */
    private function unattributedDays(array $athleteIds, array $taught): array
    {
        $days = [];
        foreach ($taught as $lessons) {
            foreach ($lessons as $lesson) {
                $days[$lesson['held_on']] = true;
            }
        }
        if ($days === [] || $athleteIds === []) {
            return [];
        }

        $rows = DB::table('attendance_records')
            ->whereIn('athlete_id', $athleteIds)
            ->whereNull('lesson_id')
            ->whereNull('deleted_at')
            ->whereIn('attended_on', array_keys($days))
            ->get(['athlete_id', 'attended_on']);

        $out = [];
        foreach ($rows as $row) {
            $out[is_numeric($row->athlete_id) ? (int) $row->athlete_id : 0][]
                = substr(\is_string($row->attended_on) ? $row->attended_on : '', 0, 10);
        }

        return $out;
    }
}
