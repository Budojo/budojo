<?php

declare(strict_types=1);

namespace App\Http\Requests\FeeTier;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Http\Requests\Concerns\ValidatesFeeTier;
use App\Models\AcademyFeeTier;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class UpdateFeeTierRequest extends FormRequest
{
    use AuthorizesAcademyCapability;
    use ValidatesFeeTier;

    public function authorize(): bool
    {
        /** @var AcademyFeeTier|null $tier */
        $tier = $this->route('tier');
        if (! $tier instanceof AcademyFeeTier) {
            return false;
        }

        // Route-bound: the capability is checked against the tier's own
        // academy, not the caller's active one — otherwise a user with
        // settings rights in academy A could re-price academy B.
        return $this->authorizeInAcademy($tier->academy_id, Capability::AcademySettingsUpdate);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var AcademyFeeTier|null $tier */
        $tier = $this->route('tier');

        return $this->feeTierRules(
            academyId: $tier?->academy_id,
            required: false,
        );
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
