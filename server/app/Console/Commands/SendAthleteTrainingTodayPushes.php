<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\Academy;
use App\Models\AttendanceRecord;
use App\Notifications\AthleteTrainingTodayNotification;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * Daily 07:00 local push reminder — "today is training day"
 * (#729 A2). Scheduled from `routes/console.php`.
 *
 * Algorithm:
 *
 *   for each academy with `training_days` configured:
 *       if today's day-of-week is in training_days:
 *           for each athlete in the academy with a linked user:
 *               if the athlete has NO attendance record for today:
 *                   if NotificationPreferences::isEnabled($user,
 *                                                          ATHLETE_TRAINING_TODAY):
 *                       $user->notify(...);
 *
 * The "no attendance record yet" check matters because an open-mat
 * athlete who got marked present at 06:30 would otherwise receive a
 * redundant 07:00 push — annoying and trust-eroding. The check is a
 * point-in-time read of `attendance_records` keyed on
 * `(athlete_id, date)`; same shape the AttendanceController guards
 * against double-marks with.
 *
 * Failures per-academy are logged and don't stop the loop — same
 * resilience posture as `SendMedicalCertExpiryReminders`.
 */
class SendAthleteTrainingTodayPushes extends Command
{
    /** @var string */
    protected $signature = 'budojo:send-athlete-training-today-pushes';

    /** @var string */
    protected $description = 'Push reminders to athletes whose academy trains today and who have not been marked present yet (#729 A2).';

    public function handle(): int
    {
        $today = Carbon::today();
        $dayOfWeek = (int) $today->dayOfWeek; // 0=Sun..6=Sat (Carbon default)

        $hasFailures = false;

        Academy::query()
            ->whereNotNull('training_days')
            ->each(function (Academy $academy) use ($dayOfWeek, $today, &$hasFailures): void {
                try {
                    $this->processAcademy($academy, $dayOfWeek, $today);
                } catch (\Throwable $e) {
                    $hasFailures = true;
                    Log::warning('athlete_training_today push fanout failed for academy', [
                        'academy_id' => $academy->id,
                        'exception' => $e::class,
                        'message' => $e->getMessage(),
                    ]);
                }
            });

        return $hasFailures ? Command::FAILURE : Command::SUCCESS;
    }

    private function processAcademy(Academy $academy, int $dayOfWeek, Carbon $today): void
    {
        /** @var list<int>|null $trainingDays */
        $trainingDays = $academy->training_days;
        if ($trainingDays === null || $trainingDays === []) {
            return;
        }
        if (! \in_array($dayOfWeek, $trainingDays, true)) {
            return;
        }

        // Athletes in the academy with a linked user account. Invited-
        // but-not-accepted rows have user_id NULL and are skipped —
        // they have no push subscriptions and no inbox to deliver to.
        $athletes = $academy->athletes()->whereNotNull('user_id')->with('user')->get();
        if ($athletes->isEmpty()) {
            return;
        }

        $presentAthleteIds = AttendanceRecord::query()
            ->whereIn('athlete_id', $athletes->pluck('id'))
            ->whereDate('attended_on', $today->toDateString())
            ->pluck('athlete_id');
        /** @var array<int, true> $presentSet */
        $presentSet = [];
        foreach ($presentAthleteIds as $id) {
            if (is_numeric($id)) {
                $presentSet[(int) $id] = true;
            }
        }

        foreach ($athletes as $athlete) {
            if (isset($presentSet[$athlete->id])) {
                continue;
            }
            $user = $athlete->user;
            if ($user === null) {
                continue;
            }
            if (! NotificationPreferences::isEnabled($user, NotificationCategory::ATHLETE_TRAINING_TODAY)) {
                continue;
            }
            if ($this->alreadyNotifiedToday($user, $today)) {
                continue;
            }
            $user->notify(new AthleteTrainingTodayNotification($academy));
        }
    }

    private function alreadyNotifiedToday(\App\Models\User $user, Carbon $today): bool
    {
        return $user->notifications()
            ->where('data->kind', 'athlete_training_today')
            ->where('created_at', '>=', $today->copy()->startOfDay())
            ->exists();
    }
}
