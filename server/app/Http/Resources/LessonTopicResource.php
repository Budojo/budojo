<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\SyllabusTopic;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LessonTopicResource extends JsonResource
{
    /**
     * A topic as a lesson names it (#1564).
     *
     * `parent_name` rides along because "Armbar" on its own is ambiguous by
     * design — an armbar from mount and one from closed guard are different
     * lessons, which is the whole reason the tree has two levels. A chip that
     * cannot say which one it means gives that back.
     *
     * `deleted` says the topic has since left the programme: the link still
     * names it, and a reader deserves to know why it is not in the picker.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var SyllabusTopic $topic */
        $topic = $this->resource;

        return [
            'id' => $topic->id,
            'name' => $topic->name,
            'kind' => $topic->kind->value,
            'parent_id' => $topic->parent_id,
            'parent_name' => $topic->relationLoaded('parent') ? $topic->parent?->name : null,
            'deleted' => $topic->trashed(),
        ];
    }
}
