<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Enums\Belt;
use App\Enums\MartialArt;
use App\Enums\TrainingMode;
use App\Support\MartialArt\MartialArtProfile;
use Illuminate\Validation\Rule;

/**
 * The shape of a syllabus topic (#1563), shared by the store and update
 * requests so the two cannot drift the first time a bound moves.
 *
 * `kind` is one of the academy's training modes or `both` (#1803) — never
 * `other`, which is a class's: a topic is the martial art by definition.
 * `from_belt` is a grade on the same art's ladder (#1861); `notes` and
 * `video_url` are the teaching notebook (#1862).
 */
trait ValidatesSyllabusTopic
{
    /**
     * @return array<string, mixed>
     */
    protected function syllabusTopicRules(bool $required, int $academyId, ?int $parentId, MartialArt $art, ?int $ignoreId = null): array
    {
        $profile = MartialArtProfile::for($art);
        $modes = array_map(static fn (TrainingMode $mode): string => $mode->value, $profile->topicModes());
        $belts = array_map(static fn (Belt $belt): string => $belt->value, $profile->ladder()->belts());

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
            'kind' => [$presence, 'string', Rule::in($modes)],
            'in_season' => ['sometimes', 'boolean'],
            // A grade of the academy's own art (#1861), or null for everyone.
            // Kids' grades are allowed even where the academy trains none:
            // that setting trims the SPA's pickers and is not enforced here.
            'from_belt' => ['sometimes', 'nullable', 'string', Rule::in($belts)],
            // How it is taught here, and where it came from (#1862). The link
            // ends up in an `href`, so it is `https://` and nothing else: no
            // `javascript:`, no `file:`, no page the browser warns about.
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'video_url' => ['sometimes', 'nullable', 'string', 'max:500', 'url:https', 'starts_with:https://'],
        ];
    }
}
