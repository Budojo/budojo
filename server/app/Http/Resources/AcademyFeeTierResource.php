<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\AcademyFeeTier;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AcademyFeeTierResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var AcademyFeeTier $tier */
        $tier = $this->resource;

        return [
            'id' => $tier->id,
            'label' => $tier->label,
            'amount_cents' => $tier->amount_cents,
            'lessons_per_week' => $tier->lessons_per_week,
            // How many people are on it: the number that makes deleting a tier
            // a decision rather than a guess.
            'athletes_count' => $tier->athletes_count ?? 0,
        ];
    }
}
