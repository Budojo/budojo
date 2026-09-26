<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Enums\AthleteStatus;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Notifications\OwnerAthleteMissedStreakNotification;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use App\Support\ScheduledDays;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * Daily engagement-signal push to the academy owner when an active
 * athlete has missed the last N (=3) scheduled trainings in a row
 * (#729 C3). Surfaces a churn signal so the instructor can reach
 * out before the athlete drops off.
 *
 * Algorithm:
 *
 *   for each academy:
 *       streak_dates = the last 3 scheduled days before today, each read
 *                      against the schedule in force on it (ScheduledDays)
 *       fewer than 3, or older than 30 days → skip the academy (not
 *                      configured, too new, or paused)
 *       for each active athlete:
 *           if attendance is present for ALL streak_dates → skip
 *           if attendance is absent for ALL streak_dates →
 *             owner gets notified (once per 14 days per athlete to
 *             avoid daily spam — checked via the inbox's existing
 *             "owner_athlete_missed_streak" kind rows).
 *
 * Per-academy failures are logged and don't stop the loop.
 */
class SendAthleteMissedStreakPushes extends Command
{
    private const int STREAK_LENGTH = 3;
    private const int RENOTIFY_AFTER_DAYS = 14;

    /**
     * How far back the streak may reach. Thirty days holds three sessions even
     * for an academy that trains weekly; a streak older than that is about a
     * schedule that stopped (a pause, a not-configured period), not about the
     * athlete, and warning about it would repeat every fortnight of the pause.
     */
    private const int STREAK_REACH_DAYS = 30;

    /** @var string */
    protected $signature = 'budojo:send-athlete-missed-streak-pushes';

    /** @var string */
    protected $description = 'Push owner when an active athlete missed the last N scheduled trainings consecutively (#729 C3).';

    public function handle(): int
    {
        $today = Carbon::today();
        $hasFailures = false;

        // Every academy: the schedule HISTORY decides, and one whose history
        // yields fewer than three training days is skipped below (#1764).
        Academy::query()
            ->with('schedules')
            ->each(function (Academy $academy) use ($today, &$hasFailures): void {
                try {
                    $this->processAcademy($academy, $today);
                } catch (\Throwable $e) {
                    $hasFailures = true;
                    Log::warning('owner_athlete_missed_streak fanout failed for academy', [
                        'academy_id' => $academy->id,
                        'exception' => $e::class,
                        'message' => $e->getMessage(),
                    ]);
                }
            });

        return $hasFailures ? Command::FAILURE : Command::SUCCESS;
    }

    private function processAcademy(Academy $academy, Carbon $today): void
    {
        // Before today, never today: the command runs from 09:30 and the
        // day's own session has not happened yet (Copilot review on #735).
        // Each day is read against the schedule in force on it (#1764), so a
        // timetable change last week does not rewrite which sessions those
        // were.
        $streakDates = ScheduledDays::lastBefore($academy, $today->toImmutable(), self::STREAK_LENGTH);
        if (\count($streakDates) < self::STREAK_LENGTH) {
            return; // Not configured, or too newly: not enough history.
        }
        if ($streakDates[self::STREAK_LENGTH - 1] < $today->copy()->subDays(self::STREAK_REACH_DAYS)->toDateString()) {
            return; // Paused: the last sessions are too long ago to be news.
        }

        $owner = $academy->owner;
        if ($owner === null) {
            return;
        }
        if (! NotificationPreferences::isEnabled($owner, NotificationCategory::OWNER_ATHLETE_MISSED_STREAK)) {
            return;
        }

        // NOT filtered on `user_id`. This alert is delivered to the OWNER —
        // `OwnerAthleteMissedStreakNotification::via()` is `['database',
        // WebPushChannel]` with the owner as the notifiable — and the signal
        // it reads is `attendance_records`, which the owner writes at
        // check-in. An athlete's linked account has nothing to do with
        // either end of it.
        //
        // The filter was here from #735 and made this command fire for
        // NOBODY on the shipping desktop build, where `athlete_accounts` is
        // off and therefore no athlete has a `user_id` at all. An owner who
        // had the preference switched on believed they were being warned.
        $athletes = $academy->athletes()
            ->where('status', AthleteStatus::Active)
            ->get();

        foreach ($athletes as $athlete) {
            if ($this->wasNotifiedRecently($owner, $athlete, $today)) {
                continue;
            }
            if (! $this->missedAllStreakDates($athlete, $streakDates)) {
                continue;
            }

            try {
                $owner->notify(new OwnerAthleteMissedStreakNotification($athlete, self::STREAK_LENGTH));
            } catch (\Throwable $e) {
                Log::warning('owner_athlete_missed_streak notification failed', [
                    'academy_id' => $academy->id,
                    'athlete_id' => $athlete->id,
                    'exception' => $e::class,
                    'message' => $e->getMessage(),
                ]);
            }
        }
    }

    /**
     * @param  list<string>  $streakDates
     */
    private function missedAllStreakDates(Athlete $athlete, array $streakDates): bool
    {
        // Guard: an athlete who joined AFTER the earliest streak date
        // wasn't even rostered when those sessions happened — counting
        // them as "missed" is a false positive. The earliest streak
        // date is the LAST element (`ScheduledDays::lastBefore()` returns
        // the most recent first, so $streakDates[0] is most recent and
        // [count-1] is oldest). Copilot review on #738.
        $oldestStreakDate = end($streakDates) ?: null;
        if ($oldestStreakDate !== null
            && $athlete->joined_at->toDateString() > $oldestStreakDate
        ) {
            return false;
        }

        $present = AttendanceRecord::query()
            ->where('athlete_id', $athlete->id)
            ->whereIn('attended_on', $streakDates)
            ->count();

        return $present === 0;
    }

    private function wasNotifiedRecently(\App\Models\User $owner, Athlete $athlete, Carbon $today): bool
    {
        return $owner->notifications()
            ->where('data->kind', 'owner_athlete_missed_streak')
            ->where('data->athlete_id', $athlete->id)
            ->where('created_at', '>=', $today->copy()->subDays(self::RENOTIFY_AFTER_DAYS))
            ->exists();
    }
}
