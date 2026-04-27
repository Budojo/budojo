<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Address;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AddressResource extends JsonResource
{
    /**
     * Wire shape mirrors the request payload (#72) so the SPA can round-trip
     * the same object: read it from `GET /academy`, edit fields, send it
     * back via `PATCH /academy`. Province / country are exposed as their
     * raw enum values (the 2-letter codes); the SPA owns label rendering.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Address $address */
        $address = $this->resource;

        return [
            'line1' => $address->line1,
            'line2' => $address->line2,
            'city' => $address->city,
            'postal_code' => $address->postal_code,
            'province' => $address->province?->value,
            'country' => $address->country->value,
        ];
    }
}
