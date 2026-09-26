<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\AcademyClosure;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AcademyClosureResource extends JsonResource
{
    /**
     * @return array{id: int, starts_on: string, ends_on: string, label: string|null}
     */
    public function toArray(Request $request): array
    {
        /** @var AcademyClosure $closure */
        $closure = $this->resource;

        return [
            'id' => $closure->id,
            'starts_on' => $closure->starts_on,
            'ends_on' => $closure->ends_on,
            'label' => $closure->label,
        ];
    }
}
