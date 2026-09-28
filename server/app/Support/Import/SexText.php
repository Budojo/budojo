<?php

declare(strict_types=1);

namespace App\Support\Import;

use App\Enums\Sex;

/**
 * The sex, read out of a spreadsheet cell (#1934): `M`, `maschio`, `F`,
 * `Femmina`, in Italian or English. Anything else comes back null, and the
 * import sends the cell as written so the row is refused with a reason rather
 * than guessed.
 */
final class SexText
{
    private const WORDS = [
        'm' => Sex::Male,
        'maschio' => Sex::Male,
        'uomo' => Sex::Male,
        'male' => Sex::Male,
        'man' => Sex::Male,
        'f' => Sex::Female,
        'femmina' => Sex::Female,
        'donna' => Sex::Female,
        'female' => Sex::Female,
        'woman' => Sex::Female,
    ];

    public static function parse(string $text): ?Sex
    {
        return self::WORDS[mb_strtolower(trim($text))] ?? null;
    }
}
