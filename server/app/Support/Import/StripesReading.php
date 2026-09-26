<?php

declare(strict_types=1);

namespace App\Support\Import;

/**
 * What `StripesText` made of a cell: the value to store, or why there is none.
 */
final readonly class StripesReading
{
    private function __construct(
        public int $stripes,
        public ?string $refusal,
    ) {
    }

    public static function of(int $stripes): self
    {
        return new self($stripes, null);
    }

    public static function refused(string $reason): self
    {
        return new self(0, $reason);
    }
}
