<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Academy;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class AcademyResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Academy $academy */
        $academy = $this->resource;

        return [
            'id' => $academy->id,
            'name' => $academy->name,
            'slug' => $academy->slug,
            'address' => $academy->address,
            'logo_url' => $academy->logo_path !== null
                ? Storage::disk('public')->url($academy->logo_path)
                : null,
        ];
    }
}
