<?php

declare(strict_types=1);

namespace App\Http\Requests\Lesson;

use App\Authorization\Capability;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Models\SyllabusTopic;
use App\Models\User;
use App\Support\OperatorDay;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

/**
 * The notes of the last evening that taught a topic (#1862). Gated on
 * `attendance_read`, like the lesson read itself: these are a lesson's notes,
 * read wherever the lesson is.
 */
class LastLessonNotesRequest extends FormRequest
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
            // A living topic of this academy's programme — the sheet only
            // offers living ones, and a foreign id reads the same as a missing one.
            'syllabus_topic_id' => [
                'required',
                'integer',
                Rule::exists('syllabus_topics', 'id')
                    ->where('academy_id', $user?->activeAcademyId() ?? 0)
                    ->whereNull('deleted_at'),
            ],
            // The day of the lesson the sheet is open on. "The last evening"
            // is one before it: tonight's plan, once somebody is checked in,
            // is held — and still this evening, not the last one.
            'before' => ['required', 'date_format:Y-m-d'],
        ];
    }

    /** The sheet's own day; only evenings before it answer. */
    public function before(): CarbonImmutable
    {
        $day = $this->validated('before');

        return CarbonImmutable::createFromFormat('Y-m-d', \is_string($day) ? $day : '')
            ?: OperatorDay::today();
    }

    /** The topic, resolved after validation. */
    public function topic(): SyllabusTopic
    {
        $id = $this->validated('syllabus_topic_id');

        return SyllabusTopic::query()->findOrFail(is_numeric($id) ? (int) $id : 0);
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
