<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

use App\Models\Academy;
use App\Models\AttendanceRecord;
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
     * @return Collection<int, AttendanceRecord>
     */
    public function execute(
        Academy $academy,
        CarbonImmutable $date,
        bool $includeTrashed = false,
    ): Collection {
        $query = AttendanceRecord::query()
            ->whereIn('athlete_id', $academy->athletes()->pluck('id'))
            ->whereDate('attended_on', $date->toDateString())
            ->orderBy('athlete_id');

        if ($includeTrashed) {
            $query->withTrashed();
        }

        return $query->get();
    }
}
