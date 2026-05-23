<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Actions\Engagement\EvaluateAchievementsAction;
use App\Models\Athlete;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Nightly evaluator for time-based achievements (#961). Catches the
 * rules that aren't fired by an event:
 *
 *   - 1_year_at_academy — anniversary day is "now"
 *   - 30_day_streak — the 30-day window ending today closes (only
 *     a `create` on attendance fires the observer; if today has no
 *     new attendance row, the streak crossing on day 30 would never
 *     be picked up event-driven)
 *
 * Event-driven kinds (first_class, 100_sessions, belt_promotion)
 * are already unlocked by AttendanceObserver / AthleteObserver — the
 * evaluator is idempotent so a second nightly pass over them is a
 * no-op.
 */
class EvaluateTimeBasedAchievements extends Command
{
    /** @var string */
    protected $signature = 'budojo:evaluate-time-based-achievements';

    /** @var string */
    protected $description = 'Nightly evaluator for time-based achievement rules (anniversary, streak) (#961).';

    public function __construct(private readonly EvaluateAchievementsAction $evaluator)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $hasFailures = false;

        Athlete::query()->whereNotNull('user_id')->each(
            function (Athlete $athlete) use (&$hasFailures): void {
                try {
                    $this->evaluator->execute($athlete);
                } catch (\Throwable $e) {
                    $hasFailures = true;
                    Log::warning('time-based achievement evaluation failed', [
                        'athlete_id' => $athlete->id,
                        'exception' => $e::class,
                        'message' => $e->getMessage(),
                    ]);
                }
            },
        );

        return $hasFailures ? Command::FAILURE : Command::SUCCESS;
    }
}
