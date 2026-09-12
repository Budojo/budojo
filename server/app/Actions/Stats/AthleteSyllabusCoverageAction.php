<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\Lesson;
use App\Models\SyllabusTopic;
use App\Support\Season;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * What this athlete has actually seen, and what they have missed (#1567).
 *
 * Somebody away for six weeks did not miss "six lessons" — they missed
 * specific topics, and "they have not seen guard retention since March" is a
 * sentence worth being able to say. It falls out of the join the coverage view
 * already needs.
 *
 * **Four states, not the academy view's three, and the fourth is the point.**
 * "Never seen" would put two unlike things in one bucket: a topic the academy
 * taught while this athlete was away, which is their gap, and a topic the
 * academy has not taught at all, which is not. Merging them writes a low
 * number on a person for a decision somebody else made about the programme —
 * exactly the scoreboard this screen must not become.
 *
 *   - `seen`       attended two or more held lessons that named it
 *   - `thin`       attended exactly one
 *   - `missed`     taught while they were on the roster, and they were not there
 *   - `not_taught` the academy has not covered it yet this season
 *
 * The headline is `seen` over what the academy **taught**, so it answers "how
 * much of what happened did you catch?" and never "how much of the syllabus
 * are you?". `not_taught` is reported beside it as the academy's context, not
 * as the athlete's gap.
 *
 * **Everything is scoped to on or after `joined_at`.** A white belt who walked
 * in last month did not miss October, and a denominator that says otherwise is
 * not honest, it is just discouraging.
 *
 * **It says what it cannot see.** A presence that names no lesson cannot be
 * attributed to any topic. #1590 attaches them going forward and backfilled
 * what it safely could, but some stay unattributed forever, and a screen that
 * silently counted those as absence would report a gap that is really a
 * missing record. The count rides along so the UI can say so.
 */
class AthleteSyllabusCoverageAction
{
    /** Attended this many held lessons for a topic to count as seen. */
    private const SEEN_AT = 2;

    /**
     * @return array<string, mixed>
     */
    public function execute(Athlete $athlete, int $seasonsBack = 0): array
    {
        $reference = CarbonImmutable::now()->subYears($seasonsBack);
        $academy = $athlete->academy;
        // `athletes.academy_id` is non-null, so the relation is only nullable
        // at the type level. Asserted rather than guarded, because a dangling
        // academy is a broken database, not a case to render.
        \assert($academy instanceof Academy);

        $start = Season::startFor($academy, $reference);
        $end = Season::endFor($academy, $reference);

        // The window starts the later of the season and the day they joined:
        // nobody misses what happened before they walked in.
        $joined = CarbonImmutable::parse($athlete->joined_at->toDateString());
        $from = $joined->greaterThan($start) ? $joined : $start;
        $today = CarbonImmutable::today();
        $to = $today->lessThan($end) ? $today : $end;

        $label = Season::labelFor($academy, $reference);
        $techniques = $this->techniques($academy->id);
        $positions = $this->positions($academy->id);

        if ($from->greaterThan($to)) {
            // They joined after this season ended, or it has not started.
            return $this->report($techniques, $positions, [], [], $start, $end, $label, $joined, 0);
        }

        $taughtByAcademy = $this->taughtByAcademy($academy->id, $from, $to);
        $attendedByAthlete = $this->attendedByAthlete($athlete, $from, $to);
        $unattributed = $this->unattributedPresences($athlete, $from, $to);

        return $this->report(
            $techniques,
            $positions,
            $taughtByAcademy,
            $attendedByAthlete,
            $start,
            $end,
            $label,
            $joined,
            $unattributed,
        );
    }

    /**
     * The programme's techniques, in season. Positions group and name; they are
     * never counted, exactly as in the academy view.
     *
     * @return Collection<int, SyllabusTopic>
     */
    private function techniques(int $academyId): Collection
    {
        return SyllabusTopic::query()
            ->where('academy_id', $academyId)
            ->where('in_season', true)
            ->whereNotNull('parent_id')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();
    }

    /**
     * @return Collection<int, SyllabusTopic>
     */
    private function positions(int $academyId): Collection
    {
        return SyllabusTopic::query()
            ->where('academy_id', $academyId)
            ->positions()
            ->get()
            ->keyBy('id');
    }

    /**
     * Topic id → how many held lessons the academy taught it in, in the window.
     *
     * @return array<int, int>
     */
    private function taughtByAcademy(int $academyId, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $rows = DB::table('lesson_topic')
            ->whereIn('lesson_topic.lesson_id', $this->heldLessonIds($academyId, $from, $to))
            ->groupBy('lesson_topic.syllabus_topic_id')
            ->get([
                'lesson_topic.syllabus_topic_id as topic_id',
                DB::raw('COUNT(DISTINCT lesson_topic.lesson_id) as lessons'),
            ]);

        $out = [];
        foreach ($rows as $row) {
            $out[is_numeric($row->topic_id) ? (int) $row->topic_id : 0]
                = is_numeric($row->lessons) ? (int) $row->lessons : 0;
        }

        return $out;
    }

    /**
     * Topic id → how many of those lessons this athlete was actually at, and
     * the last day they saw it.
     *
     * @return array<int, array{lessons: int, last: string}>
     */
    private function attendedByAthlete(Athlete $athlete, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $rows = DB::table('lesson_topic')
            ->join('lessons', 'lessons.id', '=', 'lesson_topic.lesson_id')
            ->join('attendance_records', 'attendance_records.lesson_id', '=', 'lessons.id')
            ->where('attendance_records.athlete_id', $athlete->id)
            ->whereNull('attendance_records.deleted_at')
            ->whereBetween('lessons.held_on', [$from->toDateString(), $to->toDateString()])
            ->groupBy('lesson_topic.syllabus_topic_id')
            ->get([
                'lesson_topic.syllabus_topic_id as topic_id',
                DB::raw('COUNT(DISTINCT lessons.id) as lessons'),
                DB::raw('MAX(lessons.held_on) as last_seen'),
            ]);

        $out = [];
        foreach ($rows as $row) {
            $out[is_numeric($row->topic_id) ? (int) $row->topic_id : 0] = [
                'lessons' => is_numeric($row->lessons) ? (int) $row->lessons : 0,
                // `held_on` arrives as `Y-m-d` from SQLite and may carry a time
                // from MySQL's DATE handling; both compare correctly once cut.
                'last' => substr((string) $row->last_seen, 0, 10),
            ];
        }

        return $out;
    }

    /**
     * Presences in the window that name no lesson, and so can be attributed to
     * no topic. The screen says this out loud rather than counting them as
     * absence.
     */
    private function unattributedPresences(Athlete $athlete, CarbonImmutable $from, CarbonImmutable $to): int
    {
        return DB::table('attendance_records')
            ->where('athlete_id', $athlete->id)
            ->whereNull('lesson_id')
            ->whereNull('deleted_at')
            ->whereBetween('attended_on', [$from->toDateString(), $to->toDateString()])
            ->count();
    }

    /**
     * Lessons somebody was checked into, in the window — the same definition of
     * "held" the academy view uses.
     *
     * @return \Illuminate\Database\Eloquent\Builder<Lesson>
     */
    private function heldLessonIds(int $academyId, CarbonImmutable $from, CarbonImmutable $to)
    {
        return Lesson::query()
            ->where('academy_id', $academyId)
            ->whereBetween('held_on', [$from->toDateString(), $to->toDateString()])
            ->whereHas('attendanceRecords')
            ->select('id');
    }

    /**
     * @param  Collection<int, SyllabusTopic>  $techniques
     * @param  Collection<int, SyllabusTopic>  $positions
     * @param  array<int, int>  $taught
     * @param  array<int, array{lessons: int, last: string}>  $attended
     * @return array<string, mixed>
     */
    private function report(
        Collection $techniques,
        Collection $positions,
        array $taught,
        array $attended,
        CarbonImmutable $start,
        CarbonImmutable $end,
        string $label,
        CarbonImmutable $joined,
        int $unattributed,
    ): array {
        $seen = 0;
        $thin = 0;
        $missed = [];
        $notTaught = 0;
        $lately = [];

        foreach ($techniques as $technique) {
            $academyLessons = $taught[$technique->id] ?? 0;
            $mine = $attended[$technique->id]['lessons'] ?? 0;
            $parent = $positions->get($technique->parent_id ?? 0);
            $parentName = $parent instanceof SyllabusTopic ? $parent->name : null;

            if ($academyLessons === 0) {
                // Not taught while they were here. Not their gap.
                $notTaught++;

                continue;
            }

            if ($mine >= self::SEEN_AT) {
                $seen++;
            } elseif ($mine === 1) {
                $thin++;
            } else {
                $missed[] = [
                    'id' => $technique->id,
                    'name' => $technique->name,
                    'parent_name' => $parentName,
                    'kind' => $technique->kind->value,
                    // How many chances they had, which is the difference
                    // between "you were out that night" and "you keep missing
                    // this one".
                    'taught_times' => $academyLessons,
                ];
            }

            if ($mine > 0) {
                $lately[] = [
                    'id' => $technique->id,
                    'name' => $technique->name,
                    'parent_name' => $parentName,
                    'lessons' => $mine,
                    'last_seen_on' => $attended[$technique->id]['last'],
                ];
            }
        }

        usort($lately, static fn (array $a, array $b): int => strcmp(
            (string) $b['last_seen_on'],
            (string) $a['last_seen_on'],
        ));

        $taughtCount = $seen + $thin + \count($missed);

        return [
            'season' => [
                'start' => $start->toDateString(),
                'end' => $end->toDateString(),
                'label' => $label,
            ],
            'joined_on' => $joined->toDateString(),
            'totals' => [
                // The denominator is what the academy TAUGHT, not the whole
                // syllabus. "How much of what happened did you catch?" is a
                // question about this athlete; "how much of the syllabus are
                // you?" is a question about the programme wearing their name.
                'taught_by_academy' => $taughtCount,
                'seen' => $seen,
                'thin' => $thin,
                'missed' => \count($missed),
                'percentage' => $taughtCount === 0 ? 0 : (int) round(($seen / $taughtCount) * 100),
                // Context, deliberately outside the fraction.
                'not_taught_yet' => $notTaught,
            ],
            'missed' => $missed,
            'seen_lately' => $lately,
            // What the screen cannot know, said out loud rather than counted
            // as absence.
            'unattributed_presences' => $unattributed,
        ];
    }
}
