<?php

declare(strict_types=1);

namespace App\Http\Requests\Lesson;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Http\Requests\Concerns\ResolvesLessonSlot;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * The lesson's free-text note (#1564) — "Marco's first day back". Never
 * parsed into topics: the two answer different questions, and conflating
 * them is how a tag list fills with prose.
 */
class SetLessonNotesRequest extends FormRequest
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
        return [
            ...$this->lessonSlotRules(),
            // `present` so clearing the note is expressible; the Action
            // stores an empty one as null.
            'notes' => ['present', 'nullable', 'string', 'max:2000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return $this->lessonSlotMessages();
    }

    public function notes(): ?string
    {
        $notes = $this->validated('notes');

        return \is_string($notes) ? $notes : null;
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
