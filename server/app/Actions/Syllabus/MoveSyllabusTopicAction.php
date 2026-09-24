<?php

declare(strict_types=1);

namespace App\Actions\Syllabus;

use App\Enums\MoveDirection;
use App\Models\SyllabusTopic;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

class MoveSyllabusTopicAction
{
    /**
     * One place up or down among the topic's siblings (#1661) — the
     * techniques of its position, or the academy's positions — and every
     * sibling renumbered 0…n-1.
     *
     * A swap of two `sort_order` values would be the obvious move, and it is
     * wrong wherever values tie: the list then falls back to the name, so
     * swapping two zeroes changes nothing on screen. The siblings are read in
     * the order the owner sees (`sort_order`, then `name`, then `id` as the
     * stable last key), the one element moves in that list, and the whole
     * list is written back. At either end it is a no-op, not an error: the
     * SPA disables the button there, and a double tap should not 422.
     *
     * @return Collection<int, SyllabusTopic> the siblings, in their new order
     */
    public function execute(SyllabusTopic $topic, MoveDirection $direction): Collection
    {
        return DB::transaction(function () use ($topic, $direction): Collection {
            $siblings = SyllabusTopic::query()
                ->where('academy_id', $topic->academy_id)
                ->where('parent_id', $topic->parent_id)
                ->orderBy('sort_order')
                ->orderBy('name')
                ->orderBy('id')
                ->lockForUpdate()
                ->get();

            $from = $siblings->search(static fn (SyllabusTopic $s): bool => $s->id === $topic->id);
            \assert(\is_int($from));
            $to = $direction === MoveDirection::Up ? $from - 1 : $from + 1;

            $ordered = $siblings->all();
            if ($to >= 0 && $to < \count($ordered)) {
                [$ordered[$from], $ordered[$to]] = [$ordered[$to], $ordered[$from]];
            }

            foreach (array_values($ordered) as $index => $sibling) {
                if ($sibling->sort_order !== $index) {
                    $sibling->update(['sort_order' => $index]);
                }
            }

            return new Collection(array_values($ordered));
        });
    }
}
