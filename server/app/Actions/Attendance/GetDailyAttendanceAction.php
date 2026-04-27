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

        if ($includeTrashed) {
            $query->withTrashed();
        }

        return $query->get();
    }
}
