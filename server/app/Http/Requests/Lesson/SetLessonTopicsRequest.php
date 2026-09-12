<?php

declare(strict_types=1);

namespace App\Http\Requests\Lesson;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Http\Requests\Concerns\ResolvesLessonSlot;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

/**
 * Say what a lesson covers (#1564).
 *
 * Gated on `attendance_record`, not on `academy_settings_update`: writing
 * down what was taught is the same act of witness as writing down who was
 * there, and the instructor who ran the class is the one who knows. Editing
 * the programme itself stays a settings job.
 */
class SetLessonTopicsRequest extends FormRequest
{
    use AuthorizesAcademyCapability;
    use ResolvesLessonSlot;

    public function authorize(): bool
    {
        return $this->authorizeActiveAcademy(Capability::AttendanceRecord);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var User|null $user */
        $user = $this->user();

        return [
            ...$this->lessonSlotRules(),
            // `present` and not `required`: an empty list is how the last
            // topic comes off a lesson, and `required` would reject it.
            'topic_ids' => ['present', 'array', 'max:50'],
            'topic_ids.*' => [
                'integer',
                'distinct',
                // This academy's living programme only. A topic taken out of
                // the syllabus cannot be newly attached — the links that
                // already name it survive, which is a different question.
                Rule::exists('syllabus_topics', 'id')
                    ->where('academy_id', $user?->activeAcademyId() ?? 0)
                    ->whereNull('deleted_at'),
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            ...$this->lessonSlotMessages(),
            'topic_ids.*.exists' => 'That topic is not in this academy\'s programme.',
        ];
    }

    /** @return list<int> */
    public function topicIds(): array
    {
        /** @var array<int, mixed> $raw */
        $raw = $this->validated('topic_ids') ?? [];

        return array_values(array_map(
            static fn (mixed $id): int => is_numeric($id) ? (int) $id : 0,
            $raw,
        ));
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
