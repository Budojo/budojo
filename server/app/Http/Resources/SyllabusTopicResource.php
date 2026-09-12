<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\SyllabusTopic;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SyllabusTopicResource extends JsonResource
{
    /**
     * A position carries its techniques as `children` when they were loaded;
     * a technique carries none. The client never needs to reassemble the
     * tree from a flat list.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var SyllabusTopic $topic */
        $topic = $this->resource;

        return [
            'id' => $topic->id,
            'parent_id' => $topic->parent_id,
            'name' => $topic->name,
            'kind' => $topic->kind->value,
            'in_season' => $topic->in_season,
            'sort_order' => $topic->sort_order,
            'children' => $this->whenLoaded(
                'children',
                fn () => self::collection($topic->children)->resolve($request),
            ),
        ];
    }
}
