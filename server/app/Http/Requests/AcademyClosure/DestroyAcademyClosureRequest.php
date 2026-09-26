<?php

declare(strict_types=1);

namespace App\Http\Requests\AcademyClosure;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\AcademyClosure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class DestroyAcademyClosureRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        $closure = $this->route('closure');
        if (! $closure instanceof AcademyClosure) {
            return false;
        }

        return $this->authorizeInAcademy($closure->academy_id, Capability::AcademySettingsUpdate);
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
