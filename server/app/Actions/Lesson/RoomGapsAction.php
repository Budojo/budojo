<?php

declare(strict_types=1);

namespace App\Actions\Lesson;

use App\Models\Academy;
use App\Models\AcademyClass;
use App\Models\Athlete;
use App\Models\Lesson;
use App\Models\SyllabusTopic;
use App\Support\AthleteIdentity;
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
 * A candidate is a technique the class could be told to teach
 * ({@see SyllabusTopic::scopeTeachableIn()}) that tonight's lesson does not
 * already name, and that the academy taught in at least one held lesson this
 * season **before tonight**. For each, "missed" counts the people checked in
 * tonight who were at none of those lessons and had joined by the last of
 * them. It is offered only when most of the room missed it — at least two
 * people and at least half — and at most three come back, the most missed
 * first, then the one that has waited longest.
 *
 * **Before tonight is by the clock, not by the date.** A lesson earlier the
 * same day counts — somebody who saw the armbar at the 12:30 class did not
 * miss it at 19:00 — and one later the same evening does not, because it has
 * not happened yet. When either lesson has no start time, the same-day one is
 * left out: there is no saying which came first.
 *
 * **What tonight already covers is left out**, so it cannot take a slot the
 * picker would then hide: once the instructor ticks the top gap, the next one
 * comes up in its place.
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
        $tonight = Lesson::query()
            ->where('academy_class_id', $class->id)
            ->whereDate('held_on', $heldOn->toDateString())
            ->first();

        $present = $tonight instanceof Lesson ? $this->presentAt($tonight) : [];
        if (! $tonight instanceof Lesson || \count($present) < self::MIN_PRESENT) {
            return ['present' => \count($present), 'rows' => []];
        }

        $techniques = $this->candidates($academy, $class, $tonight);
        $taught = $this->before($tonight, $this->attendance->lessonsFor(
            $academy->id,
            array_values($techniques->keys()->all()),
            Season::startFor($academy, $heldOn)->toDateString(),
            $heldOn->toDateString(),
        ));
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
     * The techniques the class could be told to teach, minus what tonight's
     * lesson already names — keyed by id.
     *
     * @return Collection<int, SyllabusTopic>
     */
    private function candidates(Academy $academy, AcademyClass $class, Lesson $tonight): Collection
    {
        $covered = DB::table('lesson_topic')
            ->where('lesson_id', $tonight->id)
            ->pluck('syllabus_topic_id');

        return SyllabusTopic::query()
            ->where('academy_id', $academy->id)
            ->teachableIn($class->kind)
            ->whereNotIn('id', $covered)
            ->with('parent')
            ->get()
            ->keyBy('id');
    }

    /**
     * Only the lessons that happened before tonight's: any earlier day, and
     * earlier the same day by the clock. Tonight's own lesson never counts.
     *
     * @param  array<int, list<array{id: int, held_on: string, name: string, kind: string, starts_at: string|null, athlete_ids: list<int>}>>  $taught
     * @return array<int, list<array{id: int, held_on: string, name: string, kind: string, starts_at: string|null, athlete_ids: list<int>}>>
     */
    private function before(Lesson $tonight, array $taught): array
    {
        $day = $tonight->held_on->toDateString();
        $at = $tonight->starts_at;

        $out = [];
        foreach ($taught as $topicId => $lessons) {
            $earlier = array_values(array_filter($lessons, static fn (array $lesson): bool => $lesson['id'] !== $tonight->id
                && ($lesson['held_on'] < $day
                    || ($lesson['held_on'] === $day
                        && $at !== null
                        && $lesson['starts_at'] !== null
                        && $lesson['starts_at'] < $at))));
            if ($earlier !== []) {
                $out[$topicId] = $earlier;
            }
        }

        return $out;
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
            'athletes' => array_map(AthleteIdentity::of(...), $missed),
            // Sort key only; stripped before the rows are returned.
            '_order' => [$parent instanceof SyllabusTopic ? $parent->sort_order : 0, $technique->sort_order],
        ];
    }

    /**
     * The athletes with a live presence on tonight's lesson, keyed by id, in
     * register order.
     *
     * @return array<int, Athlete>
     */
    private function presentAt(Lesson $tonight): array
    {
        return Athlete::query()
            ->whereIn('id', DB::table('attendance_records')
                ->where('lesson_id', $tonight->id)
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
