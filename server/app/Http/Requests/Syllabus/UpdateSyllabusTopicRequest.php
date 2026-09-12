<?php

declare(strict_types=1);

namespace App\Http\Requests\Syllabus;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Http\Requests\Concerns\ValidatesSyllabusTopic;
use App\Models\SyllabusTopic;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class UpdateSyllabusTopicRequest extends FormRequest
{
    use AuthorizesAcademyCapability;
    use ValidatesSyllabusTopic;

    public function authorize(): bool
    {
        $topic = $this->route('syllabusTopic');
        if (! $topic instanceof SyllabusTopic) {
            return false;
        }

        return $this->authorizeInAcademy($topic->academy_id, Capability::AcademySettingsUpdate);
    }

    /**
     * Partial. `parent_id` is not here on purpose: moving a technique to
     * another position is a delete and an add, and a position cannot become
     * a technique without taking its children somewhere.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var SyllabusTopic $topic */
        $topic = $this->route('syllabusTopic');

        return [
            ...$this->syllabusTopicRules(
                required: false,
                academyId: $topic->academy_id,
                parentId: $topic->parent_id,
                ignoreId: $topic->id,
            ),
            'sort_order' => ['sometimes', 'integer', 'min:0', 'max:65535'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'name.unique' => 'There is already a topic with this name here.',
        ];
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
