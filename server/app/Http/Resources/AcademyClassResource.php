<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\AcademyClass;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AcademyClassResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var AcademyClass $class */
        $class = $this->resource;

        return [
            'id' => $class->id,
            'name' => $class->name,
            'weekday' => $class->weekday,
            'starts_at' => $class->starts_at,
            'duration_minutes' => $class->duration_minutes,
            'kind' => $class->kind->value,
        ];
    }
}
