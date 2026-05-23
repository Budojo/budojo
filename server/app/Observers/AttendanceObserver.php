<?php

declare(strict_types=1);

namespace App\Observers;

use App\Actions\Engagement\EvaluateAchievementsAction;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use Illuminate\Support\Facades\Log;

/**
 * Observer for the `attendance_records` table (#961). Fires the
 * achievement evaluator on every new row — picks up first-class,
 * 100-sessions, and 30-day-streak event-driven kinds. Anniversary +
 * belt-promotion are handled elsewhere (nightly cron + AthleteObserver).
 *
 * Failures inside the evaluator are caught + logged so a mis-tuned
 * rule doesn't 500 the underlying attendance write. The mark-attendance
 * write path is the user-visible event; the achievement side is a
 * best-effort overlay.
 */
class AttendanceObserver
{
    public function __construct(
        private readonly EvaluateAchievementsAction $evaluator,
    ) {
    }

    public function created(AttendanceRecord $record): void
    {
        $athlete = $record->athlete;
        if (! $athlete instanceof Athlete) {
            return;
        }

        try {
            $this->evaluator->execute($athlete);
        } catch (\Throwable $e) {
            Log::warning('achievement evaluation failed on attendance.created', [
                'athlete_id' => $athlete->id,
                'record_id' => $record->id,
                'exception' => $e::class,
                'message' => $e->getMessage(),
            ]);
        }
    }
}
