<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Actions\Engagement\BuildWeeklyRecapAction;
use App\Models\Academy;
use App\Notifications\WeeklyRecapNotification;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Weekly recap fan-out (#960). Scheduled Sunday 19:00 local from
 * `routes/console.php`. For each academy iterate athletes with a
 * linked user account, build the recap, skip zero-session athletes
 * (no pity push), respect the WEEKLY_RECAP notification preference,
 * dedup against same-week re-runs.
 *
 * The dedup is per-(user, iso_week_start) so a mis-scheduled rerun on
 * Monday morning doesn't double-push.
 */
class SendWeeklyRecapPushes extends Command
{
    /** @var string */
    protected $signature = 'budojo:send-weekly-recap-pushes';

    /** @var string */
    protected $description = 'Push weekly recap to athletes with ≥1 attendance row last week (#960).';

    public function __construct(private readonly BuildWeeklyRecapAction $build)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        // Recap covers the week JUST ended — yesterday's date is in
        // it, today's (Sunday at fire time) is the last day. Anchor
        // to last Monday at 00:00 to land at the ISO week's start.
        $weekStart = CarbonImmutable::now()->startOfWeek(CarbonImmutable::MONDAY);

        $hasFailures = false;

        Academy::query()->each(
            function (Academy $academy) use ($weekStart, &$hasFailures): void {
                try {
                    $this->processAcademy($academy, $weekStart);
                } catch (\Throwable $e) {
                    $hasFailures = true;
                    Log::warning('weekly_recap push fanout failed for academy', [
                        'academy_id' => $academy->id,
                        'exception' => $e::class,
                        'message' => $e->getMessage(),
                    ]);
                }
            },
        );

        return $hasFailures ? Command::FAILURE : Command::SUCCESS;
    }

    private function processAcademy(Academy $academy, CarbonImmutable $weekStart): void
    {
        $athletes = $academy->athletes()->whereNotNull('user_id')->with('user')->get();
        foreach ($athletes as $athlete) {
            $user = $athlete->user;
            if ($user === null) {
                continue;
            }
            if (! NotificationPreferences::isEnabled($user, NotificationCategory::WEEKLY_RECAP)) {
                continue;
            }
            if ($this->alreadyNotifiedThisWeek($user, $weekStart)) {
                continue;
            }

            $recap = $this->build->execute($athlete, $weekStart);
            if ($recap->sessions === 0) {
                continue;
            }

            $user->notify(new WeeklyRecapNotification($recap));
        }
    }

    private function alreadyNotifiedThisWeek(\App\Models\User $user, CarbonImmutable $weekStart): bool
    {
        return $user->notifications()
            ->where('data->kind', 'weekly_recap')
            ->where('data->iso_week_start', $weekStart->toDateString())
            ->exists();
    }
}
