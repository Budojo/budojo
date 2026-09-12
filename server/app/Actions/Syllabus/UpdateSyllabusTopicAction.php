<?php

declare(strict_types=1);

namespace App\Actions\Syllabus;

use App\Models\SyllabusTopic;
use Illuminate\Support\Facades\DB;

class UpdateSyllabusTopicAction
{
    /**
     * Partial update — only the keys present change (#1563).
     *
     * `in_season` on a position cascades to every technique under it:
     * unticking "Lapel guards" in one tap is the difference between an owner
     * who narrows the seed and one who abandons it. Nothing else cascades —
     * a position's kind is a default for what gets added under it, not a
     * rule over what is already there.
     *
     * @param  array<string, mixed>  $validated  Output of FormRequest::validated()
     */
    public function execute(SyllabusTopic $topic, array $validated): SyllabusTopic
    {
        return DB::transaction(function () use ($topic, $validated): SyllabusTopic {
            $topic->update($validated);

            if (\array_key_exists('in_season', $validated) && $topic->parent_id === null) {
                $topic->children()->update(['in_season' => (bool) $validated['in_season']]);
            }

            return $topic;
        });
    }
}
