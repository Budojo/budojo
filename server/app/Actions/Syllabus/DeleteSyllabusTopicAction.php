<?php

declare(strict_types=1);

namespace App\Actions\Syllabus;

use App\Models\SyllabusTopic;
use Illuminate\Support\Facades\DB;

class DeleteSyllabusTopicAction
{
    /**
     * Soft-deletes a topic, and the techniques under a position with it
     * (#1563). Soft, because a lesson that taught the topic must still be
     * able to say so; the whole subtree, because a technique whose position
     * is gone has nowhere in the tree to be.
     */
    public function execute(SyllabusTopic $topic): void
    {
        DB::transaction(function () use ($topic): void {
            if ($topic->parent_id === null) {
                $topic->children()->delete();
            }

            $topic->delete();
        });
    }
}
