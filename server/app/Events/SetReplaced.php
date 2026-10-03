<?php

declare(strict_types=1);

namespace App\Events;

use Illuminate\Database\Eloquent\Model;

/**
 * A row's set of related rows was replaced whole, through a pivot (a lesson's
 * topics): the set it held before. A pivot's `sync()` fires no model event,
 * so this is how the sync's journal sees what such a write replaced (#2102),
 * and how a replay tells a lesson tagged on both devices from one tagged on
 * one.
 */
final readonly class SetReplaced
{
    /**
     * @param  string  $field  the request field that names the set (`topic_ids`)
     * @param  list<int>  $ids  the set before, sorted
     */
    public function __construct(
        public Model $model,
        public string $field,
        public array $ids,
    ) {
    }
}
