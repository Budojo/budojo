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

        // `recordedBy` is a non-nullable FK at the schema level, but
        // the relation can be null at hydration time if a User row
        // was hard-deleted (rare — User soft-deletes only). Defend
        // explicitly so the resource never fatals on a stale row
        // (Copilot review on #654).
        $recordedBy = $promotion->recordedBy;

        return [
            'id' => $promotion->id,
            'kind' => $promotion->kind,
            'from_belt' => $promotion->from_belt?->value,
            'to_belt' => $promotion->to_belt?->value,
            'from_stripes' => $promotion->from_stripes,
            'to_stripes' => $promotion->to_stripes,
            // Belt snapshot at the moment of the event. Lets the SPA
            // timeline render a belt-badge context on stripe rows
            // ("at what belt did this stripe happen") without joining
            // back to the athlete — the athlete's current belt may
            // have changed since.
            'belt_at_event' => $promotion->belt_at_event->value,
            'recorded_at' => $promotion->recorded_at->toIso8601String(),
            'recorded_by' => $recordedBy !== null ? [
                'id' => $recordedBy->id,
                'full_name' => trim($recordedBy->first_name . ' ' . $recordedBy->last_name),
            ] : null,
        ];
    }
}
