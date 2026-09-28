<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\Sex;
use Carbon\CarbonImmutable;

/**
 * An Italian codice fiscale, read the way DM 23/12/1976 writes it (#1934).
 *
 * Sixteen characters: six of surname and name, two of year, one month
 * letter, two of day (plus 40 for a woman), four of place (`Z…` abroad) and
 * a check character. **Omocodia**: when two people would share a code, the
 * tax office replaces digits from the right with letters (0→L … 9→V), so
 * every numeric position may hold a letter and still be valid. The check
 * character is computed over the code as written, letters included.
 *
 * Only what the code itself proves is read: the shape, the check character,
 * a real date and the sex. Whether the surname letters match the name, or the
 * place code is a real comune, needs registries this app does not carry.
 */
final readonly class FiscalCode
{
    private const SHAPE = '/^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/';

    /** The value of a character in an odd position (1st, 3rd, …). */
    private const ODD = [
        '0' => 1, '1' => 0, '2' => 5, '3' => 7, '4' => 9, '5' => 13, '6' => 15, '7' => 17, '8' => 19, '9' => 21,
        'A' => 1, 'B' => 0, 'C' => 5, 'D' => 7, 'E' => 9, 'F' => 13, 'G' => 15, 'H' => 17, 'I' => 19, 'J' => 21,
        'K' => 2, 'L' => 4, 'M' => 18, 'N' => 20, 'O' => 11, 'P' => 3, 'Q' => 6, 'R' => 8, 'S' => 12, 'T' => 14,
        'U' => 16, 'V' => 10, 'W' => 22, 'X' => 25, 'Y' => 24, 'Z' => 23,
    ];

    /** Month letters, January to December. */
    private const MONTHS = 'ABCDEHLMPRST';

    /** The letters omocodia puts in place of 0-9. */
    private const OMOCODIA = 'LMNPQRSTUV';

    private function __construct(
        public string $code,
        public Sex $sex,
        private int $yearInCentury,
        private int $month,
        private int $day,
    ) {
    }

    /** Capitals, no spaces: the way a code is stored and compared. */
    public static function normalise(string $text): string
    {
        return mb_strtoupper((string) preg_replace('/\s+/', '', $text));
    }

    /** The code, or null when its shape, check character or date is wrong. */
    public static function parse(string $text): ?self
    {
        $code = self::normalise($text);
        if (preg_match(self::SHAPE, $code) !== 1 || self::checkCharacter(substr($code, 0, 15)) !== $code[15]) {
            return null;
        }

        $year = (int) self::digits(substr($code, 6, 2));
        $month = strpos(self::MONTHS, $code[8]) + 1;
        $day = (int) self::digits(substr($code, 9, 2));
        $sex = $day > 40 ? Sex::Female : Sex::Male;
        $day = $day > 40 ? $day - 40 : $day;

        // 19yy and 20yy are leap years together for every yy but 00, and a
        // 29/02/00 code is 2000 (the latest century not in the future), so
        // 20yy settles a February 29th.
        if (! checkdate($month, $day, 2000 + $year)) {
            return null;
        }

        return new self($code, $sex, $year, $month, $day);
    }

    /**
     * The date of birth, in the latest century that does not put it in the
     * future: "17" is 2017 today, "90" is 1990. A person over a hundred reads
     * as a child; the owner can correct the date the form pre-fills.
     */
    public function birthDate(CarbonImmutable $today): CarbonImmutable
    {
        $inThisCentury = CarbonImmutable::create(2000 + $this->yearInCentury, $this->month, $this->day);

        return $inThisCentury !== null && $inThisCentury->lte($today)
            ? $inThisCentury
            : CarbonImmutable::create(1900 + $this->yearInCentury, $this->month, $this->day) ?? $today;
    }

    private static function checkCharacter(string $first15): string
    {
        $sum = 0;
        foreach (str_split($first15) as $i => $char) {
            $sum += $i % 2 === 0 ? self::ODD[$char] : self::evenValue($char);
        }

        return \chr(\ord('A') + $sum % 26);
    }

    /** An even position: a digit is itself, a letter its place in the alphabet. */
    private static function evenValue(string $char): int
    {
        return ctype_digit($char) ? (int) $char : \ord($char) - \ord('A');
    }

    /** Undo omocodia: L→0 … V→9. */
    private static function digits(string $chars): string
    {
        return strtr($chars, self::OMOCODIA, '0123456789');
    }
}
