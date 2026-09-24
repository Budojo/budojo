<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Enums\AthleteStatus;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;

/**
 * Who is drifting (#1728) — measured against each athlete's own habit.
 *
 * A fixed threshold is the wrong instrument: someone who has trained four
 * times a week for a year and is down to one is in trouble; someone who has
 * always come once a week and came once last week is fine.
 *
 * **Counted in sessions the academy held, not in weeks.** The denominator is
 * the academy's realised session dates — every distinct day anyone was checked
 * in — the same primitive `GetAthleteAttendanceSummaryAction` divides by. A
 * closure contributes nothing to it, so a closed August does not halve every
 * baseline and flag the whole roster in September. Per athlete the list is
 * clipped at `joined_at`: nobody misses what predates them. Tonight counts
 * for an athlete only once they are ticked: not being checked in yet to a
 * session still in progress is not an absence.
 *
 * The three tiers, most severe first (one value per athlete, never several):
 *
 *   - `gone` — none of the last 8 sessions, and last seen more than 21 days
 *     ago (or never, since joining).
 *   - `quiet` — none of the last 3 sessions, for someone whose own baseline
 *     rate says they would normally have come at least once in 3.
 *   - `dropping` — at least 6 presences in the baseline (the 24 sessions
 *     before the last 8), and a recent rate under half the baseline rate.
 *
 * Nobody is judged without enough of their own history: inactive athletes,
 * anyone who joined in the last 28 days, and anyone whose baseline window
 * holds fewer than 12 sessions are left out.
 *
 * This disagrees with the bell's missed-streak push on purpose.
 * `SendAthleteMissedStreakPushes` walks the SCHEDULED weekdays and asks about
 * consecutive absence; this walks the REALISED dates and asks about a ratio.
 * A Friday the academy cancelled is a miss for the push and invisible here.
 */
class AtRiskAthletesAction
{
    private const RECENT_SESSIONS = 8;

    private const BASELINE_SESSIONS = 24;

    private const QUIET_SESSIONS = 3;

    private const GONE_AFTER_DAYS = 21;

    private const NEW_JOINER_DAYS = 28;

    private const BASELINE_FLOOR_SESSIONS = 12;

    private const BASELINE_FLOOR_PRESENCES = 6;

    /** Most severe first — also the sort order of the list. */
    private const TIER_ORDER = ['gone' => 0, 'quiet' => 1, 'dropping' => 2];

    /**
     * @return array{
     *     data: list<array{
     *         athlete: array{
     *             id: int,
     *             first_name: string,
     *             last_name: string,
     *             belt: string,
     *             stripes: int,
     *             date_of_birth: string|null,
     *             status: string,
     *             photo_url: string|null,
     *             user_avatar_url: string|null,
     *             phone_country_code: string|null,
     *             phone_national_number: string|null,
     *         },
     *         tier: string,
     *         last_attended_on: string|null,
     *         recent_attended: int,
     *         recent_sessions: int,
     *         baseline_attended: int,
     *         baseline_sessions: int,
     *     }>,
     *     meta: array{sessions_available: int, sessions_needed: int},
     * }
     */
    public function execute(Academy $academy, CarbonImmutable $today): array
    {
        $sessionsAvailable = $this->sessionsOf($academy, $today)->distinct()->count('attended_on');
        $sessions = $this->latestSessions($academy, $today);

        if ($sessions === []) {
            return ['data' => [], 'meta' => $this->meta($sessionsAvailable)];
        }

        $athletes = $this->candidates($academy, $today);
        $presences = $this->presences($athletes, $sessions[\count($sessions) - 1], $today);

        $rows = [];
        foreach ($athletes as $athlete) {
            $row = $this->assess($athlete, $sessions, $presences[$athlete->id] ?? [], $today);
            if ($row !== null) {
                $rows[] = $row;
            }
        }

        usort($rows, static fn (array $a, array $b): int => [
            self::TIER_ORDER[$a['tier']],
            // Longest absent first; never-seen is the longest of all.
            $a['last_attended_on'] ?? '',
            $a['athlete']['last_name'],
            $a['athlete']['id'],
        ] <=> [
            self::TIER_ORDER[$b['tier']],
            $b['last_attended_on'] ?? '',
            $b['athlete']['last_name'],
            $b['athlete']['id'],
        ]);

        return ['data' => $rows, 'meta' => $this->meta($sessionsAvailable)];
    }

    /**
     * How many sessions exist, and how many the rules need before anyone can
     * be judged at all (#1729): the recent window plus the shortest baseline.
     * Sent rather than known by the client, so "not enough history yet" is
     * decided by the same numbers that decide the tiers.
     *
     * @return array{sessions_available: int, sessions_needed: int}
     */
    private function meta(int $sessionsAvailable): array
    {
        return [
            'sessions_available' => $sessionsAvailable,
            'sessions_needed' => self::RECENT_SESSIONS + self::BASELINE_FLOOR_SESSIONS,
        ];
    }

    /**
     * Every presence in this academy up to today — the realised sessions.
     * Through `whereHas`, like the athlete summary, so a deleted athlete's
     * presences leave with them; the SoftDeletes scope drops corrected ones.
     *
     * @return Builder<AttendanceRecord>
     */
    private function sessionsOf(Academy $academy, CarbonImmutable $today): Builder
    {
        return AttendanceRecord::query()
            ->whereHas('athlete', static fn ($q) => $q->where('academy_id', $academy->id))
            ->whereDate('attended_on', '<=', $today->toDateString());
    }

    /**
     * The most recent realised sessions, newest first — as many as the two
     * windows can ever read, since a clipped list is only ever shorter.
     *
     * @return list<string> `Y-m-d`
     */
    private function latestSessions(Academy $academy, CarbonImmutable $today): array
    {
        /** @var list<string> */
        return $this->sessionsOf($academy, $today)
            ->toBase()
            ->select('attended_on')
            ->distinct()
            ->orderByDesc('attended_on')
            // One spare: tonight drops out of the lists of everyone not yet
            // ticked, and their windows must still be full.
            ->limit(self::RECENT_SESSIONS + self::BASELINE_SESSIONS + 1)
            ->pluck('attended_on')
            ->map(static fn (mixed $day): string => substr(\is_string($day) ? $day : '', 0, 10))
            ->filter(static fn (string $day): bool => $day !== '')
            ->unique()
            ->values()
            ->all();
    }

    /**
     * Active athletes old enough in the academy to be judged, each with the
     * day of their latest presence — all time, not windowed: "last seen five
     * weeks ago" must be true even when that day predates the windows.
     *
     * @return Collection<int, Athlete>
     */
    private function candidates(Academy $academy, CarbonImmutable $today): Collection
    {
        return $academy->athletes()
            ->where('status', AthleteStatus::Active)
            ->whereDate('joined_at', '<=', $today->subDays(self::NEW_JOINER_DAYS)->toDateString())
            ->withMax('attendanceRecords as last_attended_on', 'attended_on')
            ->with('user:id,avatar_path,updated_at')
            ->get();
    }

    /**
     * Each candidate's presences inside the windows, as a set of days. One
     * query for the whole roster — distinct days, because two lessons on one
     * evening are one session.
     *
     * @param  Collection<int, Athlete>  $athletes
     * @return array<int, array<string, true>>
     */
    private function presences(Collection $athletes, string $oldest, CarbonImmutable $today): array
    {
        if ($athletes->isEmpty()) {
            return [];
        }

        $rows = AttendanceRecord::query()
            ->whereIn('athlete_id', $athletes->modelKeys())
            ->whereDate('attended_on', '>=', $oldest)
            ->whereDate('attended_on', '<=', $today->toDateString())
            ->toBase()
            ->select(['athlete_id', 'attended_on'])
            ->distinct()
            ->get();

        $byAthlete = [];
        foreach ($rows as $row) {
            \assert(isset($row->athlete_id, $row->attended_on));
            $byAthlete[(int) $row->athlete_id][substr((string) $row->attended_on, 0, 10)] = true;
        }

        return $byAthlete;
    }

    /**
     * One athlete against their own windows, or null when they are fine or
     * there is not enough of their history to say.
     *
     * @param  list<string>  $sessions  the academy's, newest first
     * @param  array<string, true>  $attended
     * @return array{
     *     athlete: array{
     *         id: int,
     *         first_name: string,
     *         last_name: string,
     *         belt: string,
     *         stripes: int,
     *         date_of_birth: string|null,
     *         status: string,
     *         photo_url: string|null,
     *         user_avatar_url: string|null,
     *         phone_country_code: string|null,
     *         phone_national_number: string|null,
     *     },
     *     tier: string,
     *     last_attended_on: string|null,
     *     recent_attended: int,
     *     recent_sessions: int,
     *     baseline_attended: int,
     *     baseline_sessions: int,
     * }|null
     */
    private function assess(Athlete $athlete, array $sessions, array $attended, CarbonImmutable $today): ?array
    {
        $joined = $athlete->joined_at->toDateString();
        $tonight = $today->toDateString();
        // Clipped at their joining day. And tonight is theirs only once they
        // are ticked: today becomes a session the moment the first person is
        // checked in, and someone not ticked YET is not absent from a session
        // still in progress (#1728 prereview). A tick tonight still counts.
        $own = array_values(array_filter(
            $sessions,
            static fn (string $day): bool => $day >= $joined && ($day !== $tonight || isset($attended[$tonight])),
        ));

        $recent = \array_slice($own, 0, self::RECENT_SESSIONS);
        $baseline = \array_slice($own, self::RECENT_SESSIONS, self::BASELINE_SESSIONS);

        if (\count($baseline) < self::BASELINE_FLOOR_SESSIONS) {
            return null;
        }

        $count = static fn (array $days): int => \count(array_filter(
            $days,
            static fn (string $day): bool => isset($attended[$day]),
        ));

        $recentAttended = $count($recent);
        $baselineAttended = $count($baseline);
        $lastAttendedOn = $this->lastAttendedOn($athlete);

        // Most severe first, and one value: an athlete who is gone is also
        // quiet and usually dropping, and saying all three says nothing more.
        $tier = match (true) {
            $recentAttended === 0 && $this->absentLong($lastAttendedOn, $today) => 'gone',
            $count(\array_slice($own, 0, self::QUIET_SESSIONS)) === 0
                && $this->usuallyComesWithin(self::QUIET_SESSIONS, $baselineAttended, \count($baseline)) => 'quiet',
            $this->isDropping($recentAttended, \count($recent), $baselineAttended, \count($baseline)) => 'dropping',
            default => null,
        };

        if ($tier === null) {
            return null;
        }

        return [
            'athlete' => [
                'id' => $athlete->id,
                'first_name' => $athlete->first_name,
                'last_name' => $athlete->last_name,
                'belt' => $athlete->belt->value,
                'stripes' => $athlete->stripes,
                'date_of_birth' => $athlete->date_of_birth?->toDateString(),
                'status' => $athlete->status->value,
                'photo_url' => $athlete->photo_url,
                'user_avatar_url' => $athlete->user?->avatar_url,
                'phone_country_code' => $athlete->phone_country_code,
                'phone_national_number' => $athlete->phone_national_number,
            ],
            'tier' => $tier,
            'last_attended_on' => $lastAttendedOn,
            'recent_attended' => $recentAttended,
            'recent_sessions' => \count($recent),
            'baseline_attended' => $baselineAttended,
            'baseline_sessions' => \count($baseline),
        ];
    }

    /** Last seen more than three weeks ago — or never, since joining. */
    private function absentLong(?string $lastAttendedOn, CarbonImmutable $today): bool
    {
        return $lastAttendedOn === null
            || CarbonImmutable::parse($lastAttendedOn)->diffInDays($today) > self::GONE_AFTER_DAYS;
    }

    /**
     * Whether, at their own baseline rate, this athlete would normally have
     * come at least once in that many sessions. Missing three is news about
     * someone who comes every other night, and an ordinary week for someone
     * who comes once in four (#1728 prereview) — so `quiet` asks this first.
     */
    private function usuallyComesWithin(int $sessions, int $baselineAttended, int $baselineSessions): bool
    {
        return $baselineAttended / $baselineSessions * $sessions >= 1;
    }

    /**
     * A recent rate under half the athlete's own baseline rate — and only on
     * a baseline with enough presences to be a habit at all.
     */
    private function isDropping(int $recentAttended, int $recentSessions, int $baselineAttended, int $baselineSessions): bool
    {
        return $baselineAttended >= self::BASELINE_FLOOR_PRESENCES
            && $recentAttended / $recentSessions < 0.5 * ($baselineAttended / $baselineSessions);
    }

    private function lastAttendedOn(Athlete $athlete): ?string
    {
        $raw = $athlete->getAttribute('last_attended_on');

        return \is_string($raw) && $raw !== '' ? substr($raw, 0, 10) : null;
    }
}
