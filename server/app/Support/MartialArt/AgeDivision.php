<?php

declare(strict_types=1);

namespace App\Support\MartialArt;

/**
 * One age division of a martial art's federation (#1807) — IBJJF's Pee Wee,
 * FIJLKAM's Esordienti B, WT's Under 30.
 *
 * Bounds are inclusive, and `max: null` is open-ended. `category` is the
 * split the stats chart filters on: IBJJF's kids and adults, FIJLKAM's
 * preagonisti and agonisti.
 */
final readonly class AgeDivision
{
    /**
     * @param 'kids'|'adults' $category
     */
    public function __construct(
        public string $code,
        public string $category,
        public int $min,
        public ?int $max,
    ) {
    }

    public function contains(int $age): bool
    {
        return $age >= $this->min && ($this->max === null || $age <= $this->max);
    }
}
