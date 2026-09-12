<?php

declare(strict_types=1);

namespace App\Actions\Lesson;

use App\Models\AcademyClass;
use App\Models\AttendanceRecord;
use App\Models\Lesson;

/**
 * Give a lesson the presences that belong to it but never said so (#1590).
 *
 * A presence carries `lesson_id = null` whenever it was recorded without a
 * session in hand — before the timetable existed, from the daily view with no
 * class picked, or by the athlete's own self-mark, which knows no class. The
 * check-in screen has always shown such a row under whichever session you are
 * looking at, so it *reads* as attended. Coverage asks the stricter question —
 * does any attendance row actually point at this lesson — and the answer was
 * no, so a session full of people counted as nothing taught.
 *
 * Tagging a lesson's topics is the owner saying, explicitly, which session
 * they mean. That is the moment to settle the attribution the screen was
 * already implying.
 *
 * **Only when the day had one session to be at.** With two classes on one
 * evening, a presence that names neither could have been at either, and a
 * guess would put someone in a room they were never in — worse than leaving
 * it unattributed, because the guess is indistinguishable from a fact
 * afterwards. The count is taken from the **timetable**, not from the lessons
 * that happen to exist: lessons come into being one at a time, so the first
 * one tagged would otherwise always look unique.
 *
 * A presence that already names a lesson is never touched, whichever lesson
 * that is. Two classes in one evening means two presences, and reassigning
 * one of them would be inventing history rather than recording it.
 */
class AdoptUnattributedAttendanceAction
{
    /** @return int how many presences joined the lesson */
    public function execute(Lesson $lesson): int
    {
        $sessionsThatWeekday = AcademyClass::query()
            ->where('academy_id', $lesson->academy_id)
            ->where('weekday', $lesson->held_on->dayOfWeekIso)
            ->count();

        if ($sessionsThatWeekday > 1) {
            return 0;
        }

        return AttendanceRecord::query()
            ->whereNull('lesson_id')
            ->whereDate('attended_on', $lesson->held_on->toDateString())
            // withTrashed: an athlete who has since left still trained that
            // night, and the lesson was still held. Dropping their presence
            // here would make a real session read as empty.
            ->whereHas('athlete', static fn ($q) => $q->withTrashed()->where('academy_id', $lesson->academy_id))
            ->update(['lesson_id' => $lesson->id]);
    }
}
