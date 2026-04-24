<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\AttendanceRecord;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AttendanceRecordResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var AttendanceRecord $record */
        $record = $this->resource;

        // Inline null-narrowing over `optional()` — PHPStan can't follow
        // optional() into the magic-call dispatch, so it stays `mixed` there.
        // `?->` preserves the narrowing and reads naturally.
        return [
            'id' => $record->id,
            'athlete_id' => $record->athlete_id,
            'attended_on' => $record->attended_on->toDateString(),
            'notes' => $record->notes,
            'created_at' => $record->created_at?->toIso8601String(),
            'deleted_at' => $record->deleted_at?->toIso8601String(),
        ];
    }
}
