<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Athlete;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * The identity of a person the owner may need to reach (#1931).
 *
 * {@see AthleteIdentityResource} plus the stored phone pair, for the lists
 * whose rows offer WhatsApp and a call: the regulars not in yet (#1730), and
 * the certificates to chase (#1931). The pair is personal data, so it rides
 * only on those — never on the identity every list of people draws.
 *
 * Both keys are always present, null when there is no number on file: the
 * client reads the pair and draws a disabled control that says why.
 *
 * `is_self` rides along because the owner can be on these lists too (#748):
 * their own row gets no reminder, since there is no one to send it to.
 */
class ContactableAthleteResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Athlete $athlete */
        $athlete = $this->resource;

        return [
            ...new AthleteIdentityResource($athlete)->toArray($request),
            'phone_country_code' => $athlete->phone_country_code,
            'phone_national_number' => $athlete->phone_national_number,
            'is_self' => $athlete->is_self,
        ];
    }
}
