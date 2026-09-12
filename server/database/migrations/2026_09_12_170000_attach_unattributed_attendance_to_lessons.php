<?php

declare(strict_types=1);

use Carbon\CarbonImmutable;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Give existing lessons the presences that belong to them (#1590).
 *
 * Until now a presence recorded without a session in hand kept
 * `lesson_id = null` forever: nothing ever went back and attributed it. The
 * check-in screen still showed it, so the data looked right, while coverage —
 * which asks whether any attendance row points at the lesson — read every one
 * of those sessions as never held and reported nothing taught.
 *
 * The code fix settles new presences going forward. This settles the ones
 * already on disk, because the alternative is asking every academy to re-tick
 * every past session by hand, which nobody is going to do.
 *
 * Same rule as `AdoptUnattributedAttendanceAction`, deliberately re-expressed
 * here in plain queries rather than calling it: a migration has to keep
 * meaning what it meant on the day it ran, and an Action is free to change.
 *
 * Conservative on purpose. A date is only settled when the academy had **one**
 * session to be at — one class on that weekday, and one lesson on that date.
 * Where there were two, a presence that names neither could have been at
 * either, and a guess would be indistinguishable from a fact afterwards.
 *
 * It walks the lessons that exist and never creates one. An academy that
 * recorded months of attendance before it had a timetable keeps most of that
 * history unattributed, and should: a timetable saying a class happens on
 * Mondays *now* is not evidence that one was taught on some Monday last
 * spring. Those dates settle themselves the day the owner tags them.
 */
return new class extends Migration
{
    public function up(): void
    {
        $lessons = DB::table('lessons')->orderBy('id')->get(['id', 'academy_id', 'held_on']);

        foreach ($lessons as $lesson) {
            $academyId = (int) $lesson->academy_id;
            // `held_on` arrives as `Y-m-d` from SQLite and may carry a time
            // from MySQL's DATE handling; both compare correctly once cut.
            $date = substr((string) $lesson->held_on, 0, 10);

            $sessionsThatWeekday = DB::table('academy_classes')
                ->where('academy_id', $academyId)
                ->where('weekday', CarbonImmutable::parse($date)->dayOfWeekIso)
                ->count();

            if ($sessionsThatWeekday > 1) {
                continue;
            }

            // Two lessons on one date means the timetable has moved under the
            // data; the weekday count cannot see that, so check it directly.
            $lessonsThatDate = DB::table('lessons')
                ->where('academy_id', $academyId)
                ->whereDate('held_on', $date)
                ->count();

            if ($lessonsThatDate > 1) {
                continue;
            }

            DB::table('attendance_records')
                ->whereNull('lesson_id')
                ->whereDate('attended_on', $date)
                // No `deleted_at` filter on either side: an athlete who has
                // since left still trained that night, and a presence that was
                // later corrected away is still not this lesson's to claim —
                // it simply has no lesson, like every other row here.
                ->whereIn('athlete_id', static function ($query) use ($academyId): void {
                    $query->select('id')->from('athletes')->where('academy_id', $academyId);
                })
                ->update(['lesson_id' => $lesson->id]);
        }
    }

    /**
     * Not reversible, and pretending otherwise would be worse than saying so.
     * Nulling `lesson_id` again would also erase every attribution made the
     * ordinary way, by a check-in that knew its class all along.
     */
    public function down(): void
    {
    }
};
