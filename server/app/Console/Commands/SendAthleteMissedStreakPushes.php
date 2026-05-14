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
 *   for each academy with training_days configured:
 *       streak_dates = the last 3 academy training_days (today + back)
 *       for each active athlete with a linked user_id:
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

    /** @var string */
    protected $signature = 'budojo:send-athlete-missed-streak-pushes';

    /** @var string */
    protected $description = 'Push owner when an active athlete missed the last N scheduled trainings consecutively (#729 C3).';

    public function handle(): int
    {
        $today = Carbon::today();
        $hasFailures = false;

        Academy::query()
            ->whereNotNull('training_days')
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
        /** @var list<int>|null $trainingDays */
        $trainingDays = $academy->training_days;
        if ($trainingDays === null || $trainingDays === []) {
            return;
        }

        $streakDates = $this->lastTrainingDays($trainingDays, $today, self::STREAK_LENGTH);
        if (\count($streakDates) < self::STREAK_LENGTH) {
            return; // Academy too newly configured — not enough history.
        }

        $owner = $academy->owner;
        if ($owner === null) {
            return;
        }
        if (! NotificationPreferences::isEnabled($owner, NotificationCategory::OWNER_ATHLETE_MISSED_STREAK)) {
            return;
        }

        $athletes = $academy->athletes()
            ->where('status', AthleteStatus::Active)
            ->whereNotNull('user_id')
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
     * Walk back from today, collecting the last `$count` dates whose
     * dayOfWeek lies in `$trainingDays`. Returns ISO date strings.
     *
     * @param  list<int>  $trainingDays  Carbon dayOfWeek ints (0..6)
     * @return list<string>
     */
    private function lastTrainingDays(array $trainingDays, Carbon $today, int $count): array
    {
        // Start from YESTERDAY — the command runs at 09:30, the
        // current day's session has not happened yet. Counting today
        // as a "missed" date would false-positive every Monday on a
        // Mon/Wed/Fri academy at 09:30 just because the Monday class
        // is at 19:00. Copilot review on #735.
        $cursor = $today->copy()->subDay();
        $dates = [];
        // Bounded walk: 30 days of history is more than enough to find
        // 3 training days even on an academy that trains weekly.
        for ($i = 0; $i < 30 && \count($dates) < $count; ++$i) {
            if (\in_array((int) $cursor->dayOfWeek, $trainingDays, true)) {
                $dates[] = $cursor->toDateString();
            }
            $cursor->subDay();
        }

        return $dates;
    }

    /**
     * @param  list<string>  $streakDates
     */
    private function missedAllStreakDates(Athlete $athlete, array $streakDates): bool
    {
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
