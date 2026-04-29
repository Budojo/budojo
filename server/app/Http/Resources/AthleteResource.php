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

        $year = (int) now()->year;
        $month = (int) now()->month;

        // Two paths so we don't pull every payment row into memory just to
        // compute a boolean:
        //   * INDEX endpoint: AthleteController::index pre-loads only the
        //     current-month slice (no N+1) — we filter the in-memory
        //     collection.
        //   * SHOW / STORE / UPDATE: relationship is NOT pre-loaded — we
        //     issue a constrained `exists()` query that returns a single
        //     bool without hydrating models.
        $paidCurrentMonth = $athlete->relationLoaded('payments')
            ? $athlete->payments
                ->where('year', $year)
                ->where('month', $month)
                ->isNotEmpty()
            : $athlete->payments()
                ->where('year', $year)
                ->where('month', $month)
                ->exists();

        // Address (#72b) — same lazy-access pattern as AcademyResource.
        // The list endpoint at AthleteController::index eager-loads
        // `address` via `->with('address')` so the 20-row page resolves
        // in one extra query instead of N+1; single-row endpoints
        // (show / store / update) hydrate the relation on demand.
        $address = $athlete->address;

        return [
            'id' => $athlete->id,
            'first_name' => $athlete->first_name,
            'last_name' => $athlete->last_name,
            'email' => $athlete->email,
            'phone_country_code' => $athlete->phone_country_code,
            'phone_national_number' => $athlete->phone_national_number,
            // Contact links (#162) — flat URL columns, each independently
            // nullable. Same shape as the academy resource.
            'website' => $athlete->website,
            'facebook' => $athlete->facebook,
            'instagram' => $athlete->instagram,
            'date_of_birth' => $athlete->date_of_birth?->toDateString(),
            'belt' => $athlete->belt->value,
            'stripes' => $athlete->stripes,
            'status' => $athlete->status->value,
            'joined_at' => $athlete->joined_at->toDateString(),
            'address' => $address !== null ? new AddressResource($address)->toArray($request) : null,
            'created_at' => $athlete->created_at?->toIso8601String(),
            'paid_current_month' => $paidCurrentMonth,
        ];
    }
}
