<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

use App\Models\Athlete;
use App\Models\AttendanceRecord;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Collection;

class GetAthleteAttendanceAction
{
    /**
     * Per-athlete history in a date window. Unbounded window (no `from`
     * and/or no `to`) is accepted — the FormRequest validates shape; the
     * action just renders what it's given.
     *
     * Ordered DESC by date so the most recent session is at the top of
     * the per-athlete list (the "am I on track?" question is usually about
     * the last few weeks, not the first few months).
     *
     * @return Collection<int, AttendanceRecord>
     */
    public function execute(
        Athlete $athlete,
        ?CarbonImmutable $from,
        ?CarbonImmutable $to,
    ): Collection {
        $query = $athlete->attendanceRecords()
            ->orderByDesc('attended_on');

        if ($from !== null) {
            $query->whereDate('attended_on', '>=', $from->toDateString());
        }

        if ($to !== null) {
            $query->whereDate('attended_on', '<=', $to->toDateString());
        }

        return $query->get();
    }
}
