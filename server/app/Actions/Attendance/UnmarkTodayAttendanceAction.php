<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

use App\Actions\Payment\ReleaseCarnetEntryAction;
use App\Enums\AttendanceSource;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Revert today's self-mark for one athlete (#960). Idempotent — the
 * "no row exists" branch is `NoRow`, NOT an error. Instructor-marked
 * rows are protected: only the instructor can revert their own marks
 * (an athlete cannot fake a "no-show" to undo what the instructor
 * saw).
 */
class UnmarkTodayAttendanceAction
{
    public function __construct(
        private readonly ReleaseCarnetEntryAction $releaseCarnetEntry,
    ) {
    }

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

        // Same contract as the owner-side delete: the entry the presence
        // consumed goes back to the athlete, atomically with the removal.
        DB::transaction(function () use ($record): void {
            $this->releaseCarnetEntry->execute($record);
            $record->delete();
        });

        return UnmarkTodayResult::Deleted;
    }
}
