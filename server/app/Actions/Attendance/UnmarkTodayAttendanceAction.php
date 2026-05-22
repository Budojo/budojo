<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

use App\Enums\AttendanceSource;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use Carbon\Carbon;

/**
 * Revert today's self-mark for one athlete (#960). Idempotent — the
 * "no row exists" branch is `NoRow`, NOT an error. Instructor-marked
 * rows are protected: only the instructor can revert their own marks
 * (an athlete cannot fake a "no-show" to undo what the instructor
 * saw).
 */
class UnmarkTodayAttendanceAction
{
    public function execute(Athlete $athlete): UnmarkTodayResult
    {
        $record = AttendanceRecord::query()
            ->where('athlete_id', $athlete->id)
            ->whereDate('attended_on', Carbon::today()->toDateString())
            ->first();

        if ($record === null) {
            return UnmarkTodayResult::NoRow;
        }
        if ($record->source !== AttendanceSource::Self) {
            return UnmarkTodayResult::InstructorLocked;
        }

        $record->delete();

        return UnmarkTodayResult::Deleted;
    }
}
