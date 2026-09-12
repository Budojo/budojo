<?php

declare(strict_types=1);

namespace App\Http\Requests\Lesson;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\AcademyClass;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

/**
 * What to teach next in a given class (#1566).
 *
 * Only the class is addressed, not a slot. The ranking reads the season so
 * far, so it is the same answer for next Wednesday as for the Wednesday
 * after — asking for a date would imply a precision the rules do not have.
 *
 * Gated on `attendance_read`, like every other read of what a class covered:
 * this is a view of the programme, not a change to it.
 */
class SuggestLessonTopicsRequest extends FormRequest
{
    use AuthorizesAcademyCapability;

    public function authorize(): bool
    {
        return $this->authorizeActiveAcademy(Capability::AttendanceRead);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var User|null $user */
        $user = $this->user();

        return [
            'academy_class_id' => [
                'required',
                'integer',
                Rule::exists('academy_classes', 'id')
                    ->where('academy_id', $user?->activeAcademyId() ?? 0),
            ],
            // Three is what fits beside the picker without becoming a list to
            // read. The cap is here so a client cannot turn a suggestion into
            // the whole syllabus by asking for it.
            'limit' => ['sometimes', 'integer', 'min:1', 'max:10'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'academy_class_id.exists' => 'That class is not on this academy\'s timetable.',
        ];
    }

    public function academyClass(): AcademyClass
    {
        /** @var AcademyClass */
        return AcademyClass::query()->findOrFail($this->integer('academy_class_id'));
    }

    public function limit(): int
    {
        return $this->has('limit') ? $this->integer('limit') : 3;
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
