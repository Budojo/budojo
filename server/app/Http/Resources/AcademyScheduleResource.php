<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\AcademySchedule;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AcademyScheduleResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var AcademySchedule $schedule */
        $schedule = $this->resource;

        return [
            'id' => $schedule->id,
            // Carbon dayOfWeek ints (0=Sun..6=Sat); null = "not configured"
            // for this period. Same shape the FE already consumes from the
            // legacy academies.training_days field.
            'training_days' => $schedule->training_days,
            // ISO yyyy-mm-dd. The FE rewrites `countScheduledTrainingDays`
            // to consume an array of these for date-aware denominator math
            // (PR 3).
            'effective_from' => $schedule->effective_from->toDateString(),
        ];
    }
}
