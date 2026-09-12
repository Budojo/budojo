<?php

declare(strict_types=1);

namespace App\Http\Requests\Syllabus;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\SyllabusTopic;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class DestroySyllabusTopicRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        $topic = $this->route('syllabusTopic');
        if (! $topic instanceof SyllabusTopic) {
            return false;
        }

        return $this->authorizeInAcademy($topic->academy_id, Capability::AcademySettingsUpdate);
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
