<?php

declare(strict_types=1);

namespace App\Http\Requests\AcademyClass;

use App\Authorization\Capability;
use App\Enums\MartialArt;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Http\Requests\Concerns\ValidatesAcademyClass;
use App\Models\AcademyClass;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class UpdateAcademyClassRequest extends FormRequest
{
    use AuthorizesAcademyCapability;
    use ValidatesAcademyClass;

    public function authorize(): bool
    {
        $class = $this->route('academyClass');
        if (! $class instanceof AcademyClass) {
            return false;
        }

        // Against the class's own academy, not the caller's active one —
        // otherwise settings rights in academy A would move academy B's
        // Tuesday class.
        return $this->authorizeInAcademy($class->academy_id, Capability::AcademySettingsUpdate);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var AcademyClass $class */
        $class = $this->route('academyClass');

        // The class's own academy, as `authorize()` checked — not the
        // caller's active one.
        return $this->academyClassRules(required: false, art: $class->academy->martial_art ?? MartialArt::Bjj);
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
