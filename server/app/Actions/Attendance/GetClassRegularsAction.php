<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

use App\Enums\AthleteStatus;
use App\Models\Academy;
use App\Models\AcademyClass;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\Lesson;
use Carbon\CarbonImmutable;

/**
 * Who usually comes to a class (#1730), so the check-in can say who of them is
 * missing tonight.
 *
 * A regular is an athlete present at three of the class's last four
 * occurrences. An occurrence is not a `lessons` row: lessons exist only since
 * #1562 and come into being on the first check-in, so reading them would leave
 * the answer empty on every academy with history. It is a day the academy held
 * a session on the class's weekday, found in the attendance itself.
 *
 * What a presence on that day counts for is the adoption rule
 * (`AdoptUnattributedAttendanceAction`, and the #1590 backfill before it). A
 * presence naming this class's lesson is this class's. One naming no lesson is
 * only where the academy had one session to be at: one class on the weekday,
 * and no lesson on the day but this one. Where there were two, a presence
 * naming neither could have been at either, and a day on which nobody named
 * this class is not known to be one of its evenings at all — so it is not one.
 * A guess would be indistinguishable from a fact afterwards.
 */
class GetClassRegularsAction
{
    /** How far back a habit is read: the class's last four evenings. */
    public const LOOKBACK = 4;

    /** Present at this many makes a regular, and fewer found names nobody. */
    public const REGULAR_AT = 3;

    /**
     * @return array{
     *     occurrences: list<string>,
     *     regulars: list<array{athlete: Athlete, attended: int, last_attended_on: string|null}>,
     * }
     */
    public function execute(Academy $academy, AcademyClass $class, CarbonImmutable $date): array
    {
        $occurrences = $this->occurrences($academy, $class, $date);
        $days = array_keys($occurrences);

        if (\count($occurrences) < self::REGULAR_AT) {
            return ['occurrences' => $days, 'regulars' => []];
        }

        $attended = array_filter(
            $this->attendance($academy, $occurrences),
            static fn (int $count): bool => $count >= self::REGULAR_AT,
        );

        return ['occurrences' => $days, 'regulars' => $this->regulars($academy, $attended, $date)];
    }

    /**
     * The class's last evenings, newest first, each with what a presence on it
     * has to say to count: the class's lesson that day, and whether naming no
     * lesson is enough.
     *
     * @return array<string, array{lesson: int|null, unattributed: bool}> keyed by `Y-m-d`
     */
    private function occurrences(Academy $academy, AcademyClass $class, CarbonImmutable $date): array
    {
        $sharedWeekday = AcademyClass::query()
            ->where('academy_id', $academy->id)
            ->where('weekday', $class->weekday)
            ->count() > 1;
        $lessons = $this->lessonsByDay($academy, $date);

        $occurrences = [];
        foreach ($this->sessionDays($academy, $class, $date) as $day) {
            $onDay = $lessons[$day] ?? [];
            $own = array_find($onDay, static fn (array $lesson): bool => $lesson['class'] === $class->id);
            $settled = ! $sharedWeekday && ($onDay === [] || (\count($onDay) === 1 && $own !== null));
            $named = $own !== null && $own['held'];

            if ($settled || $named) {
                $occurrences[$day] = ['lesson' => $own['id'] ?? null, 'unattributed' => $settled];
            }
            if (\count($occurrences) === self::LOOKBACK) {
                break;
            }
        }

        return $occurrences;
    }

    /**
     * Days anyone in the academy was checked in on the class's weekday, before
     * the one asked about, newest first. Lazily: the walk stops at the fourth
     * occurrence, not at the academy's first day.
     *
     * @return iterable<int, string> `Y-m-d`
     */
    private function sessionDays(Academy $academy, AcademyClass $class, CarbonImmutable $date): iterable
    {
        $rows = AttendanceRecord::query()
            ->whereHas('athlete', static fn ($q) => $q->where('academy_id', $academy->id))
            ->whereDate('attended_on', '<', $date->toDateString())
            ->toBase()
            ->select('attended_on')
            ->distinct()
            ->orderByDesc('attended_on')
            ->cursor();

        $previous = null;
        foreach ($rows as $row) {
            \assert(isset($row->attended_on));
            $day = substr((string) $row->attended_on, 0, 10);
            if ($day !== $previous && CarbonImmutable::parse($day)->dayOfWeek === $class->weekday) {
                yield $day;
            }
            $previous = $day;
        }
    }

    /**
     * Every lesson the academy had before the day, by the day it fell on — all
     * of them, planned ones included, because a second lesson on a day is what
     * says there were two sessions to be at. `held` is whether anybody was
     * checked into it.
     *
     * @return array<string, list<array{id: int, class: int|null, held: bool}>>
     */
    private function lessonsByDay(Academy $academy, CarbonImmutable $date): array
    {
        $lessons = Lesson::query()
            ->where('academy_id', $academy->id)
            ->whereDate('held_on', '<', $date->toDateString())
            ->withExists(['attendanceRecords as held' => static fn ($q) => $q->whereHas('athlete')])
            ->get(['id', 'academy_class_id', 'held_on']);

        $byDay = [];
        foreach ($lessons as $lesson) {
            $byDay[$lesson->held_on->toDateString()][] = [
                'id' => $lesson->id,
                'class' => $lesson->academy_class_id,
                'held' => (bool) $lesson->getAttribute('held'),
            ];
        }

        return $byDay;
    }

    /**
     * How many of the occurrences each athlete is credited with, in one query
     * over the four days.
     *
     * @param  array<string, array{lesson: int|null, unattributed: bool}>  $occurrences
     * @return array<int, int> athlete id => occurrences attended
     */
    private function attendance(Academy $academy, array $occurrences): array
    {
        $rows = AttendanceRecord::query()
            ->whereHas('athlete', static fn ($q) => $q->where('academy_id', $academy->id))
            ->where(static function ($q) use ($occurrences): void {
                foreach (array_keys($occurrences) as $day) {
                    $q->orWhereDate('attended_on', $day);
                }
            })
            ->toBase()
            ->select(['athlete_id', 'attended_on', 'lesson_id'])
            ->get();

        $credited = [];
        foreach ($rows as $row) {
            \assert(isset($row->athlete_id, $row->attended_on));
            $day = substr((string) $row->attended_on, 0, 10);
            $occurrence = $occurrences[$day];
            $lessonId = $row->lesson_id === null ? null : (int) $row->lesson_id;

            $counts = $lessonId === null
                ? $occurrence['unattributed']
                : $lessonId === $occurrence['lesson'];
            if ($counts) {
                // Keyed by day: two rows on one evening are one evening.
                $credited[(int) $row->athlete_id][$day] = true;
            }
        }

        return array_map(\count(...), $credited);
    }

    /**
     * The active athletes among them, most regular first, then by name — each
     * with the last day they were seen before the one asked about, in any class.
     *
     * @param  array<int, int>  $attended
     * @return list<array{athlete: Athlete, attended: int, last_attended_on: string|null}>
     */
    private function regulars(Academy $academy, array $attended, CarbonImmutable $date): array
    {
        if ($attended === []) {
            return [];
        }

        $athletes = $academy->athletes()
            ->whereIn('id', array_keys($attended))
            ->where('status', AthleteStatus::Active)
            ->withMax(
                ['attendanceRecords as last_attended_on' => static fn ($q) => $q->whereDate('attended_on', '<', $date->toDateString())],
                'attended_on',
            )
            ->with('user')
            ->get()
            ->sortBy([
                static fn (Athlete $a, Athlete $b): int => $attended[$b->id] <=> $attended[$a->id],
                static fn (Athlete $a, Athlete $b): int => [$a->last_name, $a->first_name, $a->id] <=> [$b->last_name, $b->first_name, $b->id],
            ]);

        return $athletes->map(static function (Athlete $athlete) use ($attended): array {
            $last = $athlete->getAttribute('last_attended_on');

            return [
                'athlete' => $athlete,
                'attended' => $attended[$athlete->id],
                'last_attended_on' => \is_string($last) && $last !== '' ? substr($last, 0, 10) : null,
            ];
        })->values()->all();
    }
}
