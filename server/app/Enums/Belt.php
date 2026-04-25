<?php

declare(strict_types=1);

namespace App\Enums;

enum Belt: string
{
    case White = 'white';
    case Blue = 'blue';
    case Purple = 'purple';
    case Brown = 'brown';
    case Black = 'black';

    /**
     * IBJJF rank: white < blue < purple < brown < black. Single source of
     * truth for any "by belt rank" ordering — sort controllers, attendance
     * summaries, future promotion logic. Update this once when the rank
     * scale changes; everything that consumes it stays consistent.
     */
    public function rank(): int
    {
        return match ($this) {
            self::White => 1,
            self::Blue => 2,
            self::Purple => 3,
            self::Brown => 4,
            self::Black => 5,
        };
    }
}
