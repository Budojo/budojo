<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Enums\AthleteStatus;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\SyllabusTopic;
use App\Support\Season;
use App\Support\TopicAttendance;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Who has seen this technique (#1745): the held lessons that taught it this
 * season, and the roster split three ways against them.
 *
 * It is the athlete × technique matrix read one column at a time, which is
 * how the question is actually asked — before a private lesson, before a
 * promotion, before deciding tonight's class. A 278-column grid does not fit a
 * desktop window; one column, opened on demand, does.
 *
 * The three states are the athlete tab's, read from the other side (#1567),
 * and a fourth for what the record cannot say:
 *
 *   - `seen`      at two or more of those lessons
 *   - `thin`      at exactly one
 *   - `never`     on the roster while it was taught, and at none of them
 *   - `unplaced`  at none of them by the record, but trained on one of those
 *                 days with no lesson named (#1590). Could have been there;
 *                 never read as an absence, and never filed under `never`.
 *
 * **"On the roster" has two edges.** Somebody who joined after the last lesson
 * that taught it did not miss it; somebody who had already left before the
 * first one did not either — an inactive athlete whose status moved before
 * that day (#1741) is not in the read. An inactive athlete whose departure has
 * no date stays, labelled by `status`, because a guess in either direction
 * would be a fact nobody recorded.
 *
 * **A topic nobody taught returns nobody.** Putting the roster under `never`
 * for a technique the academy has not covered would hang the academy's gap on
 * the people — the rule #1567 set for `not_taught`.
 *
 * **A position drills down to the lessons that named the position itself** —
 * "we worked half guard", the `worked` count beside its bar — not the union of
 * its techniques. Two different facts. The athletes × positions grid (#1747)
 * deliberately does merge them, at position level, for a different question;
 * neither of the two is a bug.
 *
 * Not a ranking: athletes come in register order, active before inactive, and
 * nothing here sorts people by how much they have seen.
 */
class TopicExposureAction
{
    /** At this many of the lessons for the technique to count as seen — the athlete tab's rule. */
    private const SEEN_AT = 2;

    public function __construct(
        private readonly TopicAttendance $attendance,
    ) {
    }

    /**
     * @return array<string, mixed>
     */
    public function execute(SyllabusTopic $topic, int $seasonsBack = 0): array
    {
        $academy = $topic->academy;
        // `syllabus_topics.academy_id` is non-null; a dangling academy is a
        // broken database, not a case to render.
        \assert($academy instanceof Academy);

        $reference = CarbonImmutable::now()->subYears($seasonsBack);
        $start = Season::startFor($academy, $reference);
        $end = Season::endFor($academy, $reference);

        $lessons = $this->attendance->lessonsFor(
            $academy->id,
            [$topic->id],
            $start->toDateString(),
            $end->toDateString(),
        )[$topic->id] ?? [];

        $athletes = $this->athletes($academy->id, $lessons, $this->unplacedOnThoseDays($academy->id, $lessons));

        $totals = ['lessons' => \count($lessons), 'seen' => 0, 'thin' => 0, 'never' => 0, 'unplaced' => 0];
        foreach ($athletes as $row) {
            $totals[$row['state']]++;
        }

        $parent = $topic->parent;

        return [
            'topic' => [
                'id' => $topic->id,
                'name' => $topic->name,
                'parent_name' => $parent instanceof SyllabusTopic ? $parent->name : null,
                'kind' => $topic->kind->value,
                'in_season' => $topic->in_season,
            ],
            'season' => [
                'start' => $start->toDateString(),
                'end' => $end->toDateString(),
                'label' => Season::labelFor($academy, $reference),
            ],
            'lessons' => array_map(static fn (array $lesson): array => [
                'id' => $lesson['id'],
                'held_on' => $lesson['held_on'],
                'name' => $lesson['name'],
                'kind' => $lesson['kind'],
                'starts_at' => $lesson['starts_at'],
                'headcount' => \count($lesson['athlete_ids']),
            ], $lessons),
            'athletes' => $athletes,
            'totals' => $totals,
        ];
    }

    /**
     * The roster against these lessons, in register order, active first.
     *
     * @param  list<array{id: int, held_on: string, name: string, kind: string, starts_at: string|null, athlete_ids: list<int>}>  $lessons
     * @return list<array{
     *     id: int,
     *     first_name: string,
     *     last_name: string,
     *     belt: string,
     *     stripes: int,
     *     status: string,
     *     joined_at: string,
     *     date_of_birth: string|null,
     *     photo_url: string|null,
     *     user_avatar_url: string|null,
     *     exposures: int,
     *     last_seen_on: string|null,
     *     state: 'seen'|'thin'|'never'|'unplaced',
     * }>
     *
     * @param  array<int, true>  $unplaced  athletes who trained on one of those days with no lesson named
     */
    private function athletes(int $academyId, array $lessons, array $unplaced): array
    {
        if ($lessons === []) {
            // Nobody has seen it because nobody has taught it.
            return [];
        }

        $first = $lessons[0]['held_on'];
        $last = $lessons[\count($lessons) - 1]['held_on'];

        /** @var array<int, array{count: int, last: string}> $exposure */
        $exposure = [];
        foreach ($lessons as $lesson) {
            foreach ($lesson['athlete_ids'] as $athleteId) {
                $exposure[$athleteId] = [
                    'count' => ($exposure[$athleteId]['count'] ?? 0) + 1,
                    // Oldest first, so the last write is the latest day.
                    'last' => $lesson['held_on'],
                ];
            }
        }

        $roster = Athlete::query()
            ->where('academy_id', $academyId)
            ->with('user')
            ->get()
            ->sortBy(static fn (Athlete $a): array => [
                $a->status === AthleteStatus::Active ? 0 : 1,
                $a->last_name_sort,
                $a->first_name_sort,
                $a->id,
            ]);

        $rows = [];
        foreach ($roster as $athlete) {
            $mine = $exposure[$athlete->id] ?? null;
            // Trained on one of those days, at a lesson the record cannot
            // name: they were on the roster that day, so no edge applies.
            $isUnplaced = $mine === null && isset($unplaced[$athlete->id]);

            if ($mine === null && ! $isUnplaced && ! $this->onTheRosterFor($athlete, $first, $last)) {
                continue;
            }

            $count = $mine['count'] ?? 0;
            $rows[] = [
                'id' => $athlete->id,
                'first_name' => $athlete->first_name,
                'last_name' => $athlete->last_name,
                'belt' => $athlete->belt->value,
                'stripes' => $athlete->stripes,
                'status' => $athlete->status->value,
                'joined_at' => $athlete->joined_at->toDateString(),
                'date_of_birth' => $athlete->date_of_birth?->toDateString(),
                'photo_url' => $athlete->photo_url,
                'user_avatar_url' => $athlete->user?->avatar_url,
                'exposures' => $count,
                'last_seen_on' => $mine['last'] ?? null,
                'state' => match (true) {
                    $count >= self::SEEN_AT => 'seen',
                    $count === 1 => 'thin',
                    $isUnplaced => 'unplaced',
                    default => 'never',
                },
            ];
        }

        return $rows;
    }

    /**
     * Whether somebody at none of the lessons was nonetheless there to miss
     * one: joined on or before the last, and not already gone before the first.
     */
    private function onTheRosterFor(Athlete $athlete, string $first, string $last): bool
    {
        if ($athlete->joined_at->toDateString() > $last) {
            return false;
        }

        $leftOn = $athlete->status === AthleteStatus::Inactive
            ? $athlete->status_changed_at?->toDateString()
            : null;

        return $leftOn === null || $leftOn >= $first;
    }

    /**
     * The athletes with a presence on one of the days it was taught that names
     * no lesson. Each could have been at one of these lessons, so they are
     * never read as absent (#1590). A presence on a day the technique was not
     * taught says nothing about it and does not count.
     *
     * @param  list<array{id: int, held_on: string, name: string, kind: string, starts_at: string|null, athlete_ids: list<int>}>  $lessons
     * @return array<int, true>
     */
    private function unplacedOnThoseDays(int $academyId, array $lessons): array
    {
        if ($lessons === []) {
            return [];
        }

        $days = array_values(array_unique(array_column($lessons, 'held_on')));

        $ids = DB::table('attendance_records')
            ->join('athletes', 'athletes.id', '=', 'attendance_records.athlete_id')
            ->where('athletes.academy_id', $academyId)
            ->whereNull('attendance_records.lesson_id')
            ->whereNull('attendance_records.deleted_at')
            ->whereIn('attendance_records.attended_on', $days)
            ->distinct()
            ->pluck('attendance_records.athlete_id');

        $out = [];
        foreach ($ids as $id) {
            if (is_numeric($id)) {
                $out[(int) $id] = true;
            }
        }

        return $out;
    }
}
