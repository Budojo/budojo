<?php

declare(strict_types=1);

namespace App\Http\Requests\Lesson;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Http\Requests\Concerns\ResolvesLessonSlot;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Read one lesson by the slot it occupies (#1564). Gated on
 * `attendance_read`: what a class covered is read wherever attendance is.
 */
class ShowLessonRequest extends FormRequest
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
