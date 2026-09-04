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
        ];
    }
}
