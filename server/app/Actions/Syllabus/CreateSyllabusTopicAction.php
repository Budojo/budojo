<?php

declare(strict_types=1);

namespace App\Actions\Syllabus;

use App\Enums\TopicKind;
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
     * Ownership and depth are the request's job — by the time this runs the
     * parent, if any, is one of the academy's positions.
     */
    public function execute(Academy $academy, string $name, TopicKind $kind, ?SyllabusTopic $parent = null, bool $inSeason = true): SyllabusTopic
    {
        $last = SyllabusTopic::query()
            ->where('academy_id', $academy->id)
            ->where('parent_id', $parent?->id)
            ->max('sort_order');

        return SyllabusTopic::create([
            'academy_id' => $academy->id,
            'parent_id' => $parent?->id,
            'name' => $name,
            'kind' => $kind,
            'in_season' => $inSeason,
            'sort_order' => is_numeric($last) ? (int) $last + 1 : 0,
        ]);
    }
}
