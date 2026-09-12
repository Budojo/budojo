<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Enums\TopicKind;
use Illuminate\Validation\Rule;

/**
 * The shape of a syllabus topic (#1563), shared by the store and update
 * requests so the two cannot drift the first time a bound moves.
 */
trait ValidatesSyllabusTopic
{
    /**
     * @return array<string, mixed>
     */
    protected function syllabusTopicRules(bool $required, int $academyId, ?int $parentId, ?int $ignoreId = null): array
    {
        $presence = $required ? 'required' : 'sometimes';

        return [
            // Unique among its living siblings: "armbar" twice under closed
            // guard is the free-text drift the tree exists to prevent, while
            // "armbar" under mount as well is the design.
            'name' => [
                $presence,
                'string',
                'max:80',
                Rule::unique('syllabus_topics', 'name')
                    ->where('academy_id', $academyId)
                    ->where('parent_id', $parentId)
                    ->whereNull('deleted_at')
                    ->ignore($ignoreId),
            ],
            'kind' => [$presence, Rule::enum(TopicKind::class)],
            'in_season' => ['sometimes', 'boolean'],
        ];
    }
}
