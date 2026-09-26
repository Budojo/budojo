<?php

declare(strict_types=1);

namespace App\Http\Requests\Promotion;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * The athletes who may be ready for their next step (#1841). No input: no
 * threshold to set, because there is none.
 */
class PromotionCandidatesRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        return $this->authorizeActiveAcademy(Capability::AthletesRead);
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [];
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
