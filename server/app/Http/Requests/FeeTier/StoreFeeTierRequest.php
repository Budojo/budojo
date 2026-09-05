<?php

declare(strict_types=1);

namespace App\Http\Requests\FeeTier;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Http\Requests\Concerns\ValidatesFeeTier;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class StoreFeeTierRequest extends FormRequest
{
    use AuthorizesAcademyCapability;
    use ValidatesFeeTier;

    /**
     * The price list is academy configuration, so it is gated by
     * `AcademySettingsUpdate` — the same permission as changing the flat fee
     * it generalises. Front-desk staff who may record a payment have no
     * business setting what the payment is.
     */
    public function authorize(): bool
    {
        return $this->authorizeActiveAcademy(Capability::AcademySettingsUpdate);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var User $user */
        $user = $this->user();

        return $this->feeTierRules(
            academyId: $user->activeAcademyId(),
            required: true,
        );
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
