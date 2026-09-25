<?php

declare(strict_types=1);

namespace App\Http\Requests\Syllabus;

use App\Authorization\Capability;
use App\Enums\MartialArt;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Http\Requests\Concerns\ValidatesSyllabusTopic;
use App\Models\SyllabusTopic;
use App\Models\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Arr;
use Illuminate\Validation\Rule;

class StoreSyllabusTopicRequest extends FormRequest
{
    use AuthorizesAcademyCapability;
    use ValidatesSyllabusTopic;

    /**
     * The programme is academy configuration, gated like the timetable and
     * the price list: whoever may change the academy's settings may change
     * what it says it teaches.
     */
    public function authorize(): bool
    {
        return $this->authorizeActiveAcademy(Capability::AcademySettingsUpdate);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var User $user */
        $user = $this->user();
        $academyId = (int) $user->activeAcademyId();
        $parentId = $this->parentId();

        return [
            // A position of this academy, or nothing. Exactly two levels: a
            // technique cannot be the parent of anything, so a parent that
            // has a parent is refused with the same message as a foreign one.
            'parent_id' => [
                'sometimes',
                'nullable',
                'integer',
                Rule::exists('syllabus_topics', 'id')
                    ->where('academy_id', $academyId)
                    ->whereNull('parent_id')
                    ->whereNull('deleted_at'),
            ],
            ...$this->syllabusTopicRules(
                required: true,
                academyId: $academyId,
                parentId: $parentId,
                art: $user->activeAcademy()->martial_art ?? MartialArt::Bjj,
            ),
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'parent_id.exists' => 'The parent must be one of this academy\'s positions.',
            'name.unique' => 'There is already a topic with this name here.',
        ];
    }

    /**
     * The new topic's own fields, with the defaults a topic starts from — the
     * same shape `UpdateSyllabusTopicAction` takes, so the two writes read
     * alike. `parent_id` is not among them: the parent is resolved on its own.
     *
     * - `in_season` absent means in season: a new topic is part of this year.
     * - `from_belt` absent on a technique takes its position's (#1861) — a
     *   default for what is added under a position, the rule `kind` follows
     *   in the dialog. Sent as null, it is for everyone, whatever the
     *   position says.
     *
     * @return array<string, mixed>
     */
    public function topicAttributes(): array
    {
        $attributes = Arr::except($this->validated(), ['parent_id']);

        return [
            'in_season' => true,
            'from_belt' => $this->parent()?->from_belt,
            ...$attributes,
        ];
    }

    /** The position the new topic goes under, resolved after validation. */
    public function parent(): ?SyllabusTopic
    {
        $parentId = $this->parentId();

        return $parentId === null ? null : SyllabusTopic::query()->find($parentId);
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }

    private function parentId(): ?int
    {
        $raw = $this->input('parent_id');

        return is_numeric($raw) ? (int) $raw : null;
    }
}
