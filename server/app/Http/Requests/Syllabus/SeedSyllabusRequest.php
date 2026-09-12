<?php

declare(strict_types=1);

namespace App\Http\Requests\Syllabus;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * "Start from the BJJ programme" (#1563) — no body; the gate is the point.
 */
class SeedSyllabusRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        return $this->authorizeActiveAcademy(Capability::AcademySettingsUpdate);
    }

    /**
     * @return array<string, mixed>
     */
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
