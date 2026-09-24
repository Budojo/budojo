<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Document;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Document
 */
class DocumentResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Document $d */
        $d = $this->resource;

        return [
            'id' => $d->id,
            'athlete_id' => $d->athlete_id,
            // Set when the document is the academy's own paper rather than a
            // person's (#1743). Exactly one of the two is non-null, so a
            // reader can tell the kinds apart without loading a relation.
            'academy_id' => $d->academy_id,
            'type' => $d->type->value,
            'original_name' => $d->original_name,
            'mime_type' => $d->mime_type,
            'size_bytes' => $d->size_bytes,
            'issued_at' => $d->issued_at?->toDateString(),
            'expires_at' => $d->expires_at?->toDateString(),
            'notes' => $d->notes,
            'created_at' => $d->created_at?->toIso8601String(),
            // Null on active documents, set on tombstones (see PRD P0.7b).
            // Consumers use this field to distinguish active from cancelled.
            'deleted_at' => $d->deleted_at?->toIso8601String(),
            // The whole identity, not just the name (#1851): the expiring list
            // draws the person with their belt, like every other list of people.
            'athlete' => $this->whenLoaded('athlete', function () use ($d, $request): ?array {
                $athlete = $d->athlete;
                if ($athlete === null) {
                    return null;
                }

                return new AthleteIdentityResource($athlete)->toArray($request);
            }),
        ];
    }
}
