<?php

declare(strict_types=1);

namespace App\Support\MartialArt;

use App\Enums\Belt;
use App\Enums\GradeCount;

/**
 * One rung of a martial art's ladder (#1800).
 *
 * `maxStripes` caps the plain 0…n integer stored in `athletes.stripes`;
 * `count` and `first` say how to read it — a FIJLKAM black belt is
 * `maxStripes: 4, count: dan, first: 1`, stored 0–4 and shown 1°–5° dan. The
 * stored value never carries the offset, so validation and the column stay
 * what they were.
 */
final readonly class Grade
{
    public function __construct(
        public Belt $belt,
        public int $maxStripes,
        public GradeCount $count = GradeCount::Stripe,
        public int $first = 0,
        public bool $kids = false,
    ) {
    }

    /**
     * @return array{belt: string, max_stripes: int, count: string, first: int, kids: bool}
     */
    public function toArray(): array
    {
        return [
            'belt' => $this->belt->value,
            'max_stripes' => $this->maxStripes,
            'count' => $this->count->value,
            'first' => $this->first,
            'kids' => $this->kids,
        ];
    }
}
