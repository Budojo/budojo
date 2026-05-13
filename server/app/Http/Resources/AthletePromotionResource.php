<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\AthletePromotion;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Wire shape for an athlete-promotion history row. Mirrors the
 * `athlete_promotions` table; `recordedBy` is eager-loaded by the
 * controller so the resource can surface the editor's name without
 * an N+1 round-trip.
 *
 * `kind` discriminates the populated columns:
 * - `belt`: `from_belt` (nullable on first assignment) + `to_belt`.
 * - `stripe`: `from_stripes` + `to_stripes`.
 */
class AthletePromotionResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var AthletePromotion $promotion */
        $promotion = $this->resource;

        return [
            'id' => $promotion->id,
            'kind' => $promotion->kind,
            'from_belt' => $promotion->from_belt?->value,
            'to_belt' => $promotion->to_belt?->value,
            'from_stripes' => $promotion->from_stripes,
            'to_stripes' => $promotion->to_stripes,
            'recorded_at' => $promotion->recorded_at->toIso8601String(),
            // `recordedBy` is a non-nullable FK at the schema level,
            // but the relation can still be null if the User row was
            // hard-deleted (rare — User soft-deletes only). PHPStan
            // sees the relation type as User per the BelongsTo
            // annotation; defend against the row-gone case anyway.
            'recorded_by' => [
                'id' => $promotion->recordedBy->id,
                'full_name' => trim($promotion->recordedBy->first_name . ' ' . $promotion->recordedBy->last_name),
            ],
        ];
    }
}
