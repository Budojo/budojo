<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

use App\Models\Academy;
use App\Models\Athlete;
use Carbon\Carbon;
use Illuminate\Support\Collection;

/**
 * Peer-preview query for the "Chi viene stasera?" row on the athlete-
 * portal self-mark page (#958). Returns athletes from the SAME academy
 * who have an active attendance row for today, capped at 8 and sorted
 * most-recent-first. Athletes who opted out via
 * `users.attendance_peer_visible = false` are filtered out.
 */
class GetTodayPeersAction
{
    private const int MAX_PREVIEW = 8;

    /**
     * @return Collection<int, Athlete>
     */
    public function execute(Academy $academy): Collection
    {
        return $academy->athletes()
            ->whereHas('user', function ($q): void {
                $q->where('attendance_peer_visible', true);
            })
            ->whereHas('attendanceRecords', function ($q): void {
                $q->whereDate('attended_on', Carbon::today()->toDateString());
            })
            ->with(['user', 'attendanceRecords' => function ($q): void {
                $q->whereDate('attended_on', Carbon::today()->toDateString());
            }])
            ->limit(self::MAX_PREVIEW)
            ->get();
    }
}
