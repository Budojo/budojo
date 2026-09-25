<?php

declare(strict_types=1);

namespace App\Actions\Syllabus;

use App\Models\Academy;
use App\Models\SyllabusTopic;

class CreateSyllabusTopicAction
{
    /**
     * Adds a position (no parent) or a technique (under one) at the end of
     * its siblings (#1563). Appending rather than taking a `sort_order` from
     * the caller: a new topic goes where the owner is looking, which is the
     * bottom of the list, and the order can be changed afterwards.
     *
     * The topic's own fields arrive as one validated map — name, kind, season,
     * belt (#1861), notes and link (#1862) — the shape
     * `UpdateSyllabusTopicAction` takes too. They had become six positional
     * arguments and were about to be eight; the placement is what this Action
     * decides, and it is decided here whatever the fields say.
     *
     * Ownership and depth are the request's job — by the time this runs the
     * parent, if any, is one of the academy's positions.
     *
     * @param  array<string, mixed>  $attributes  Output of `StoreSyllabusTopicRequest::topicAttributes()`
     */
    public function execute(Academy $academy, ?SyllabusTopic $parent, array $attributes): SyllabusTopic
    {
        $last = SyllabusTopic::query()
            ->where('academy_id', $academy->id)
            ->where('parent_id', $parent?->id)
            ->max('sort_order');

        return SyllabusTopic::create([
            ...$attributes,
            'academy_id' => $academy->id,
            'parent_id' => $parent?->id,
            'sort_order' => is_numeric($last) ? (int) $last + 1 : 0,
        ]);
    }
}
