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

    // Senior IBJJF ranks beyond black (#229 — request from beta tester
    // Luigi). 1°-6° grau on black are stored as `stripes` 1-6, not as
    // separate enum cases — that re-uses the existing stripes mechanism.
    // 7°+ ARE separate cases because their colour changes:
    case RedAndBlack = 'red-and-black'; // 7° grau — coral
    case RedAndWhite = 'red-and-white'; // 8° grau — coral
    case Red = 'red';                   // 9° / 10° grau — grand master

    /**
     * IBJJF rank: kids (grey < yellow < orange < green) < adults (white <
     * blue < purple < brown < black) < senior coral and red. Single
     * source of truth for any "by belt rank" ordering — sort controllers,
     * attendance summaries, future promotion logic. Update this once when
     * the rank scale changes; everything that consumes it stays consistent.
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
            self::RedAndBlack => 10,
            self::RedAndWhite => 11,
            self::Red => 12,
        };
    }

    /**
     * Maximum stripes for THIS belt.
     *   - Black: 0-6 (the graus 1°-6° within the black-belt phase, IBJJF
     *     standard).
     *   - Every other belt: 0-4 (kids, adult, and coral/red belts share
     *     the canonical four-stripe progression).
     *
     * Centralised here so the validation layer and the SPA picker stay
     * in sync via a single match — no magic numbers in StoreAthleteRequest
     * / UpdateAthleteRequest / athlete-form.component.
     */
    public function maxStripes(): int
    {
        return $this === self::Black ? 6 : 4;
    }
}
