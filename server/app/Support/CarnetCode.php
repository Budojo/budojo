<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Draws the human-facing carnet code.
 *
 * The alphabet omits the glyph pairs that get misread when a code is read
 * aloud or off a handwritten card — no `0`/`O`, no `1`/`I`/`L`. What is left
 * is 31 symbols, so a 4-character code covers ~923k values.
 *
 * Draws are random rather than sequential: a counter would leak how many
 * carnets an academy has ever sold and make the next code guessable.
 * Uniqueness is the database's job — `SellCarnetAction` redraws when the
 * unique index rejects a collision.
 */
class CarnetCode
{
    public const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    public const LENGTH = 4;

    public function generate(): string
    {
        $lastIndex = \strlen(self::ALPHABET) - 1;

        $code = '';
        for ($position = 0; $position < self::LENGTH; $position++) {
            $code .= self::ALPHABET[random_int(0, $lastIndex)];
        }

        return $code;
    }
}
