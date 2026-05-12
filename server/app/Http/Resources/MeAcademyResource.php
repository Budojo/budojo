<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Academy;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/**
 * Wire shape for `GET /api/v1/me/academy` (#618, M7 PR-D slice 2).
 *
 * Subset of `AcademyResource` minus owner-private fields
 * (`monthly_fee_cents` doesn't surface here — athletes don't see
 * the academy's fee column), plus an `owner` block carrying public
 * contact info (first_name, last_name, email) so athletes know
 * whom to reach out to about training, payments, schedule changes.
 * V1 owner persona is single per academy; multi-owner academies
 * (V2) would surface a list.
 */
class MeAcademyResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Academy $academy */
        $academy = $this->resource;
        $address = $academy->address;
        /** @var User|null $owner */
        $owner = $academy->owner;

        return [
            'id' => $academy->id,
            'name' => $academy->name,
            'slug' => $academy->slug,
            'phone_country_code' => $academy->phone_country_code,
            'phone_national_number' => $academy->phone_national_number,
            'website' => $academy->website,
            'facebook' => $academy->facebook,
            'instagram' => $academy->instagram,
            'address' => $address !== null ? new AddressResource($address)->toArray($request) : null,
            'logo_url' => $academy->logo_path !== null
                ? Storage::disk('public')->url($academy->logo_path)
                : null,
            'training_days' => $academy->training_days,
            'owner' => $owner !== null ? [
                'first_name' => $owner->first_name,
                'last_name' => $owner->last_name,
                'email' => $owner->email,
            ] : null,
        ];
    }
}
