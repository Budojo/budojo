<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Lesson;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LessonResource extends JsonResource
{
    /**
     * One occurrence of a class, with what it covers (#1564).
     *
     * `held` is derived, never stored: a lesson is held when somebody was
     * checked into it, and nothing else. That is what keeps a plan from
     * reporting itself as taught — the confirmation is the check-in, so
     * there is no step anybody has to remember and no flag to go stale.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Lesson $lesson */
        $lesson = $this->resource;

        return [
            'id' => $lesson->id,
            'academy_class_id' => $lesson->academy_class_id,
            'held_on' => $lesson->held_on->toDateString(),
            'name' => $lesson->name,
            'starts_at' => $lesson->starts_at,
            'kind' => $lesson->kind->value,
            'notes' => $lesson->notes,
            'held' => $lesson->attendanceRecords()->exists(),
            'topics' => LessonTopicResource::collection($lesson->topics)->resolve($request),
        ];
    }
}
