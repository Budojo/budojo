<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Athlete;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AthleteResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Athlete $athlete */
        $athlete = $this->resource;

        return [
            'id' => $athlete->id,
            'first_name' => $athlete->first_name,
            'last_name' => $athlete->last_name,
            'email' => $athlete->email,
            'phone' => $athlete->phone,
            'date_of_birth' => $athlete->date_of_birth?->toDateString(),
            'belt' => $athlete->belt->value,
            'stripes' => $athlete->stripes,
            'status' => $athlete->status->value,
            'joined_at' => $athlete->joined_at->toDateString(),
            'created_at' => $athlete->created_at?->toIso8601String(),
            // The list endpoint eager-loads the current-month payments slice
            // to avoid N+1 (see AthleteController::index). Single-row
            // endpoints (show / store / update) lazy-load the relationship
            // for one extra query — acceptable for a single row, and keeps
            // the resource shape uniform across surfaces (#104 / #105).
            'paid_current_month' => $athlete->payments
                ->where('year', (int) now()->year)
                ->where('month', (int) now()->month)
                ->isNotEmpty(),
        ];
    }
}
