<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

use App\Models\Academy;
use App\Models\AcademyClass;
use App\Models\AttendanceRecord;
use App\Models\Lesson;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;

class GetDailyAttendanceAction
{
    /**
     * All attendance records for a given date, scoped to the academy's
     * athletes. `$includeTrashed` is controlled by the `?trashed=1` query
     * param exposed to the client — the default path filters tombstones
     * so the instructor sees the live roster, not a history of corrections.
     *
     * **With a class (#1562)** the answer narrows to that class's lesson for
     * the day, plus every presence recorded on the day with no lesson at all.
     * The second half is what keeps history readable: an academy that sets
     * up its timetable in September and opens last March's Monday must see
     * the twenty people who trained, not an empty room because nobody knew
     * about classes back then. Records that belong to a *different* class
     * that day are left out — that is the whole point of asking for one.
     *
     * A GET never creates the lesson. If nobody has been checked into the
     * class yet, only the class-less presences come back.
     *
     * @return Collection<int, AttendanceRecord>
     */
    public function execute(
        Academy $academy,
        CarbonImmutable $date,
        bool $includeTrashed = false,
        ?AcademyClass $academyClass = null,
    ): Collection {
        // whereHas over pluck('id')->whereIn: the pluck path issues an extra
        // `SELECT id FROM athletes` and materializes the full id list into
        // PHP — fine for a 30-person dojo, wasteful once an academy has
        // hundreds of athletes. whereHas emits a single `EXISTS (SELECT 1
        // FROM athletes WHERE …)` subquery, letting the DB do the scoping
        // with the (athlete_id, deleted_at) index.
        $query = AttendanceRecord::query()
            ->whereHas('athlete', fn ($q) => $q->where('academy_id', $academy->id))
            ->whereDate('attended_on', $date->toDateString())
            ->orderBy('athlete_id');

        if ($academyClass !== null) {
            $rawLessonId = Lesson::query()
                ->where('academy_class_id', $academyClass->id)
                ->whereDate('held_on', $date->toDateString())
                ->value('id');
            $lessonId = is_numeric($rawLessonId) ? (int) $rawLessonId : null;

            $query->where(static function ($q) use ($lessonId): void {
                $q->whereNull('lesson_id');
                if ($lessonId !== null) {
                    $q->orWhere('lesson_id', $lessonId);
                }
            });
        }

        if ($includeTrashed) {
            $query->withTrashed();
        }

        return $query->get();
    }
}
