<?php

declare(strict_types=1);

namespace App\Enums;

enum Belt: string
{
    // IBJJF Youth belts (#230 — request from beta tester Luigi). Kept on a
    // single linear rank scale below white so "sort by belt asc" surfaces
    // beginners (kids first, then adult start) and "desc" surfaces seniors.
    case Grey = 'grey';
    case Yellow = 'yellow';
    case Orange = 'orange';
    case Green = 'green';

    case White = 'white';
    case Blue = 'blue';
    case Purple = 'purple';
    case Brown = 'brown';
    case Black = 'black';

    /**
     * IBJJF rank: kids (grey < yellow < orange < green) < adults (white <
     * blue < purple < brown < black). Single source of truth for any
     * "by belt rank" ordering — sort controllers, attendance summaries,
     * future promotion logic. Update this once when the rank scale
     * changes; everything that consumes it stays consistent.
     */
    public function rank(): int
    {
        return match ($this) {
            self::Grey => 1,
            self::Yellow => 2,
            self::Orange => 3,
            self::Green => 4,
            self::White => 5,
            self::Blue => 6,
            self::Purple => 7,
            self::Brown => 8,
            self::Black => 9,
        };
    }
}
