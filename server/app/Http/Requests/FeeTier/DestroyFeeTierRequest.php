<?php

declare(strict_types=1);

namespace App\Http\Requests\FeeTier;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\AcademyFeeTier;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class DestroyFeeTierRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        /** @var AcademyFeeTier|null $tier */
        $tier = $this->route('tier');
        if (! $tier instanceof AcademyFeeTier) {
            return false;
        }

        return $this->authorizeInAcademy($tier->academy_id, Capability::AcademySettingsUpdate);
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
