<?php

declare(strict_types=1);

namespace App\Actions\Engagement;

use App\Models\Academy;
use App\Models\AttendanceRecord;
use Carbon\CarbonImmutable;

/**
 * Top-5 mat-hours leaderboard for an academy in a calendar month
 * (#962). Anonymises rows where the linked user has
 * `leaderboard_visible = false` — the user's sessions still count
 * toward rank computation (so order is faithful), but the row name
 * collapses to "Anonimo" / "Anonymous" on the wire.
 *
 * Per athlete: count distinct attended_on rows in the window,
 * multiply by HOURS_PER_SESSION (1.5h flat per the M4 PRD). The
 * action returns the top 5 ranked desc by hours, then first_name
 * asc as a tiebreaker.
 */
class GetMonthlyLeaderboardAction
{
    private const float HOURS_PER_SESSION = 1.5;
    private const int TOP_N = 5;

    /**
     * @return list<array{
     *     rank: int,
     *     athlete_id: int,
     *     first_name: string,
     *     last_name_initial: string,
     *     sessions: int,
     *     hours: float,
     *     anonymous: bool,
     *     is_self: bool,
     * }>
     */
    public function execute(Academy $academy, CarbonImmutable $month, ?int $selfAthleteId = null): array
    {
        $start = $month->startOfMonth();
        $end = $month->endOfMonth();

        $rows = AttendanceRecord::query()
            ->join('athletes', 'athletes.id', '=', 'attendance_records.athlete_id')
            ->leftJoin('users', 'users.id', '=', 'athletes.user_id')
            ->where('athletes.academy_id', $academy->id)
            ->whereBetween('attendance_records.attended_on', [
                $start->toDateString(),
                $end->toDateString(),
            ])
            ->selectRaw(
                'athletes.id as athlete_id, '
                . 'athletes.first_name, '
                . 'athletes.last_name, '
                . 'COALESCE(users.leaderboard_visible, 1) as visible, '
                . 'COUNT(DISTINCT attendance_records.attended_on) as session_count',
            )
            ->groupBy('athletes.id', 'athletes.first_name', 'athletes.last_name', 'visible')
            ->orderByDesc('session_count')
            ->orderBy('athletes.first_name')
            ->limit(self::TOP_N)
            ->get();

        $rank = 0;
        $result = [];
        foreach ($rows as $row) {
            $rank++;
            $athleteIdRaw = $row->getAttribute('athlete_id');
            $sessionsRaw = $row->getAttribute('session_count');
            $athleteId = is_numeric($athleteIdRaw) ? (int) $athleteIdRaw : 0;
            $sessions = is_numeric($sessionsRaw) ? (int) $sessionsRaw : 0;
            $visibleRaw = $row->getAttribute('visible');
            // Comparison-safe — MySQL returns int, SQLite returns string sometimes.
            $anonymous = ! ((bool) $visibleRaw);
            $firstName = \is_string($row->getAttribute('first_name'))
                ? $row->getAttribute('first_name')
                : '';
            $lastName = \is_string($row->getAttribute('last_name'))
                ? $row->getAttribute('last_name')
                : '';

            $result[] = [
                'rank' => $rank,
                'athlete_id' => $athleteId,
                'first_name' => $anonymous ? '' : $firstName,
                'last_name_initial' => $anonymous || $lastName === ''
                    ? ''
                    : mb_strtoupper(mb_substr($lastName, 0, 1)),
                'sessions' => $sessions,
                'hours' => $sessions * self::HOURS_PER_SESSION,
                'anonymous' => $anonymous,
                'is_self' => $selfAthleteId !== null && $selfAthleteId === $athleteId,
            ];
        }

        return $result;
    }
}
