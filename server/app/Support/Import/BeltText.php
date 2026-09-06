<?php

declare(strict_types=1);

namespace App\Support\Import;

use App\Enums\Belt;

/**
 * A belt, read out of a spreadsheet cell (#1346).
 *
 * The CSV import exists so an academy can stop retyping sixty athletes into a
 * form. That only works if the parser accepts what their file actually says —
 * `Blu`, `cintura blu`, `BLU` — rather than the `blue` the API speaks. A
 * parser that only accepts the wire format rejects every real file, and an
 * import that rejects every real file reads as broken.
 *
 * It stays **strict about the unknown**. Anything unrecognised comes back
 * `null` and the row is reported in the preview with a reason. A guess would
 * be worse than a refusal: a wrong belt lands quietly on a real person's
 * record, and nobody ever finds out it was the importer's invention.
 *
 * Kept apart from the client's i18n labels on purpose. Those are UI copy and
 * change for UI reasons; this is an input vocabulary that only ever grows, and
 * a synonym added here must never move what a screen displays.
 */
final class BeltText
{
    /**
     * Every spelling we accept, normalised, mapped to the case it means.
     *
     * Both genders because both get typed — "cintura bianca" is the correct
     * Italian and "bianco" is what half of people write, and being right about
     * grammar at the cost of rejecting the row helps nobody.
     *
     * @var array<string, Belt>
     */
    private const SYNONYMS = [
        // Italian — feminine (agreeing with "cintura") and masculine.
        'bianca' => Belt::White,
        'bianco' => Belt::White,
        'grigia' => Belt::Grey,
        'grigio' => Belt::Grey,
        'gialla' => Belt::Yellow,
        'giallo' => Belt::Yellow,
        'arancione' => Belt::Orange,
        'arancio' => Belt::Orange,
        'verde' => Belt::Green,
        'blu' => Belt::Blue,
        'azzurra' => Belt::Blue,
        'azzurro' => Belt::Blue,
        'viola' => Belt::Purple,
        'marrone' => Belt::Brown,
        'nera' => Belt::Black,
        'nero' => Belt::Black,
        'rossa' => Belt::Red,
        'rosso' => Belt::Red,

        // English, for a file exported from an English-language product.
        'white' => Belt::White,
        'grey' => Belt::Grey,
        'gray' => Belt::Grey,
        'yellow' => Belt::Yellow,
        'orange' => Belt::Orange,
        'green' => Belt::Green,
        'blue' => Belt::Blue,
        'purple' => Belt::Purple,
        'brown' => Belt::Brown,
        'black' => Belt::Black,
        'red' => Belt::Red,

        // The coral belts, which nobody writes the same way twice.
        'rosso nera' => Belt::RedAndBlack,
        'rossa nera' => Belt::RedAndBlack,
        'rossa e nera' => Belt::RedAndBlack,
        'rosso e nero' => Belt::RedAndBlack,
        'red and black' => Belt::RedAndBlack,
        'coral' => Belt::RedAndBlack,
        'corallo' => Belt::RedAndBlack,
        'rosso bianca' => Belt::RedAndWhite,
        'rossa bianca' => Belt::RedAndWhite,
        'rossa e bianca' => Belt::RedAndWhite,
        'rosso e bianco' => Belt::RedAndWhite,
        'red and white' => Belt::RedAndWhite,
    ];

    public static function parse(?string $text): ?Belt
    {
        $normalised = self::normalise($text);
        if ($normalised === '') {
            return null;
        }

        // The enum's own values first — `red-and-black` arrives here as
        // `red and black`, so this is really "did they paste our API's
        // vocabulary back at us", which an export-then-reimport does.
        foreach (Belt::cases() as $belt) {
            if (self::normalise($belt->value) === $normalised) {
                return $belt;
            }
        }

        return self::SYNONYMS[$normalised] ?? null;
    }

    /**
     * Lower-case, unpunctuated, single-spaced, and without the noun.
     *
     * Hyphens and slashes become spaces so `rosso-nera` and `rossa e nera`
     * collapse to the same key — the alternative is listing every punctuation
     * variant of every coral spelling, which is a list nobody maintains.
     */
    private static function normalise(?string $text): string
    {
        if ($text === null) {
            return '';
        }

        $lower = mb_strtolower(trim($text));
        $spaced = (string) preg_replace('/[-_\/]+/', ' ', $lower);
        $collapsed = trim((string) preg_replace('/\s+/', ' ', $spaced));

        // "cintura blu" and "blu" are the same answer. Only as a prefix: a
        // cell reading just "cintura" says nothing and must stay unparseable.
        return (string) preg_replace('/^cintura (di colore )?/', '', $collapsed);
    }
}
