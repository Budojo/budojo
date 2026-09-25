<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Athlete;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * One regular of a class (#1730), as the check-in's missing panel draws them:
 * the identity every list of people carries (#1851), the phone the contact
 * buttons need, and the habit that made them a regular.
 *
 * Flat rather than nested under `athlete`, as the issue specified it: the
 * panel's rows are people, and nothing else rides on them.
 */
class ClassRegularResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var array{athlete: Athlete, attended: int, last_attended_on: string|null} $regular */
        $regular = $this->resource;
        $athlete = $regular['athlete'];

        return [
            ...new AthleteIdentityResource($athlete)->toArray($request),
            'phone_country_code' => $athlete->phone_country_code,
            'phone_national_number' => $athlete->phone_national_number,
            'attended' => $regular['attended'],
            'last_attended_on' => $regular['last_attended_on'],
        ];
    }
}
