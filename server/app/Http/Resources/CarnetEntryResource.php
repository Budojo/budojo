<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\CarnetEntry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CarnetEntryResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var CarnetEntry $entry */
        $entry = $this->resource;

        return [
            'id' => $entry->id,
            'carnet_id' => $entry->carnet_id,
            'attendance_record_id' => $entry->attendance_record_id,
            'used_on' => $entry->used_on->toDateString(),
            // The lesson's own snapshot of its class name (#1654), so a class
            // renamed or deleted since still reads as it was that evening.
            // Null for a presence with no lesson: a self-mark, or one recorded
            // before the timetable (#1562).
            'lesson_name' => $entry->attendanceRecord?->lesson?->name,
        ];
    }
}
