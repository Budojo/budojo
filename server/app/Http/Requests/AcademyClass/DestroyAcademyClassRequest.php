<?php

declare(strict_types=1);

namespace App\Http\Requests\AcademyClass;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\AcademyClass;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class DestroyAcademyClassRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        $class = $this->route('academyClass');
        if (! $class instanceof AcademyClass) {
            return false;
        }

        return $this->authorizeInAcademy($class->academy_id, Capability::AcademySettingsUpdate);
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
