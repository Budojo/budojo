<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Academy;
use App\Models\Athlete;
use App\Notifications\OwnerAthleteMissedStreakNotification;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use App\Support\OperatorDay;
use App\Support\ReminderSubjects;
use Carbon\CarbonInterface;
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
 *           if attendance is present for ANY streak_date → skip
 *           if attendance is absent for ALL streak_dates →
 *             owner gets notified (once per 14 days per athlete to
 *             avoid daily spam, and never twice about the same streak —
 *             checked via the inbox's existing
 *             "owner_athlete_missed_streak" kind rows).
 *
 * Per-academy failures are logged and don't stop the loop.
 */
class SendAthleteMissedStreakPushes extends Command
{
    private const int RENOTIFY_AFTER_DAYS = 14;

    /** @var string */
    protected $signature = 'budojo:send-athlete-missed-streak-pushes';

    /** @var string */
    protected $description = 'Push owner when an active athlete missed the last N scheduled trainings consecutively (#729 C3).';

    public function handle(): int
    {
        $today = OperatorDay::today();
        $hasFailures = false;

        // Every academy: the schedule HISTORY decides, and one whose history
        // yields fewer than three training days is skipped below (#1764).
        Academy::query()
            ->with(['schedules', 'closures'])
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

    private function processAcademy(Academy $academy, CarbonInterface $today): void
    {
        $streakDates = ReminderSubjects::streakDates($academy, $today);
        if ($streakDates === null) {
            return; // Not configured, too new, or paused.
        }

        $owner = $academy->owner;
        if ($owner === null) {
            return;
        }
        if (! NotificationPreferences::isEnabled($owner, NotificationCategory::OWNER_ATHLETE_MISSED_STREAK)) {
            return;
        }

        foreach (ReminderSubjects::missedTheStreak($academy, $streakDates) as $athlete) {
            if ($this->alreadyTold($owner, $athlete, $today, $streakDates)) {
                continue;
            }

            try {
                $owner->notify(new OwnerAthleteMissedStreakNotification($athlete, ReminderSubjects::STREAK_LENGTH));
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
     * Told within the fortnight, or told since the latest session of this
     * streak — the same three sessions, with nothing new missed since. The
     * second half is what keeps a pause quiet: its streak does not move, and
     * the fortnight alone would repeat the same news once it ran out.
     *
     * @param  list<string>  $streakDates  most recent first
     */
    private function alreadyTold(\App\Models\User $owner, Athlete $athlete, CarbonInterface $today, array $streakDates): bool
    {
        $fortnight = $today->copy()->subDays(self::RENOTIFY_AFTER_DAYS);
        $afterStreak = Carbon::parse($streakDates[0])->addDay();

        return $owner->notifications()
            ->where('data->kind', 'owner_athlete_missed_streak')
            ->where('data->athlete_id', $athlete->id)
            ->where('created_at', '>=', $fortnight->min($afterStreak))
            ->exists();
    }
}
