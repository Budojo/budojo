<?php

declare(strict_types=1);

namespace App\Http\Requests\Lesson;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Http\Requests\Concerns\ResolvesLessonSlot;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * What tonight's people missed (#1860), addressed by the slot the lesson
 * sheet is open on — the class and the day, because the people are the ones
 * checked into that one lesson.
 *
 * Gated on `attendance_read`, like every other read of what a class covered:
 * the instructor who ran the class is the reader.
 */
class RoomGapsRequest extends FormRequest
{
    use AuthorizesAcademyCapability;
    use ResolvesLessonSlot;

    public function authorize(): bool
    {
        return $this->authorizeActiveAcademy(Capability::AttendanceRead);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return $this->lessonSlotRules();
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return $this->lessonSlotMessages();
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
