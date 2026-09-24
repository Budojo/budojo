<?php

declare(strict_types=1);

namespace App\Http\Requests\Syllabus;

use App\Authorization\Capability;
use App\Enums\MoveDirection;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\SyllabusTopic;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** One step up or down the programme (#1661) — the same right as editing it. */
class MoveSyllabusTopicRequest extends FormRequest
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

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'direction' => ['required', Rule::enum(MoveDirection::class)],
        ];
    }

    public function direction(): MoveDirection
    {
        return MoveDirection::from($this->string('direction')->toString());
    }
}
