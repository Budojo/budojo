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

        // Lazy access — `$academy->address` triggers the morph relation
        // load on first read. For show / update endpoints that's a single
        // extra query; for list endpoints we'd want explicit eager loading,
        // but academy is always a single-row resource (per-tenant), so the
        // N+1 surface is zero.
        $address = $academy->address;

        return [
            'id' => $academy->id,
            'name' => $academy->name,
            'slug' => $academy->slug,
            // Phone (#161) — same shape as AthleteResource. Both fields null
            // OR both filled by the schema's `required_with` rule.
            'phone_country_code' => $academy->phone_country_code,
            'phone_national_number' => $academy->phone_national_number,
            'address' => $address !== null ? new AddressResource($address)->toArray($request) : null,
            'logo_url' => $academy->logo_path !== null
                ? Storage::disk('public')->url($academy->logo_path)
                : null,
            'monthly_fee_cents' => $academy->monthly_fee_cents,
            'training_days' => $academy->training_days,
        ];
    }
}
