<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Carnet;
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
            // Derived, never stored. `entries_count` is absent on a carnet
            // that was just created (nothing consumed yet) — hence the zero.
            'remaining_entries' => $carnet->total_entries - ($carnet->entries_count ?? 0),
            'price_cents' => $carnet->price_cents,
            'purchased_at' => $carnet->purchased_at->toDateString(),
            'expires_at' => $carnet->expires_at->toDateString(),
        ];
    }
}
