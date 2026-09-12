<?php

declare(strict_types=1);

namespace App\Actions\Engagement;

use App\Models\Academy;
use App\Models\AttendanceRecord;
use App\Support\MatHours;
use Carbon\CarbonImmutable;

/**
 * Top-5 mat-hours leaderboard for an academy in a calendar month
 * (#962). Anonymises rows where the linked user has
 * `leaderboard_visible = false` — the user's sessions still count
 * toward rank computation (so order is faithful), but the row name
 * collapses to "Anonimo" / "Anonymous" on the wire.
 *
 * Per athlete: count distinct attended_on rows in the window,
 * sum the length of each lesson they name (#1591, `App\Support\MatHours`),
 * falling back to ninety minutes for a presence that names none. The
 * action returns the top 5 ranked desc by hours, then first_name
 * asc as a tiebreaker.
 */
class GetMonthlyLeaderboardAction
{
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
            // Left, not inner: a presence that names no lesson still counts,
            // at the fallback length. An inner join would drop it entirely and
            // quietly shrink the month.
            ->leftJoin('lessons', 'lessons.id', '=', 'attendance_records.lesson_id')
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
                . 'COUNT(DISTINCT attendance_records.attended_on) as session_count, '
                // The 90 is `MatHours::FALLBACK_MINUTES` spelled out, because
                // `selectRaw` demands a literal-string and a concatenated
                // constant is not one. The lesson-less leaderboard test pins
                // the two together, so they cannot drift unnoticed.
                . 'SUM(COALESCE(lessons.duration_minutes, 90)) as total_minutes',
            )
            ->groupBy('athletes.id', 'athletes.first_name', 'athletes.last_name', 'visible')
            ->orderByDesc('session_count')
            // Folded (#1527), and here the collation decides MEMBERSHIP rather
            // than just order: with a `LIMIT` on a tied session count, an
            // `Ângelo` sorted past every ASCII name is not merely last — he is
            // off the board.
            ->orderBy('athletes.first_name_sort')
            ->orderBy('athletes.id')
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
            $minutesRaw = $row->getAttribute('total_minutes');
            $minutes = is_numeric($minutesRaw) ? (int) $minutesRaw : 0;
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
                'hours' => MatHours::fromMinutes($minutes),
                'anonymous' => $anonymous,
                'is_self' => $selfAthleteId !== null && $selfAthleteId === $athleteId,
            ];
        }

        return $result;
    }
}
