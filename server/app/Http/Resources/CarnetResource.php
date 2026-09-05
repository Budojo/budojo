<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Carnet;
use App\Support\CarnetAvailability;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CarnetResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Carnet $carnet */
        $carnet = $this->resource;

        return [
            'id' => $carnet->id,
            'code' => $carnet->code,
            'athlete_id' => $carnet->athlete_id,
            'total_entries' => $carnet->total_entries,
            'remaining_entries' => CarnetAvailability::remainingEntries($carnet),
            'price_cents' => $carnet->price_cents,
            'purchased_at' => $carnet->purchased_at->toDateString(),
            'expires_at' => $carnet->expires_at->toDateString(),
            // Spendable *today* — the read-side view. Consumption asks the
            // same question of the attended date instead, which is why the
            // predicate lives in one place rather than being inlined here.
            'is_active' => CarnetAvailability::isActiveOn($carnet, CarbonImmutable::today()),
        ];
    }
}
