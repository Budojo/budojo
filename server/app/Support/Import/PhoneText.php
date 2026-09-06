<?php

declare(strict_types=1);

namespace App\Support\Import;

use libphonenumber\PhoneNumberUtil;

/**
 * A phone pair, split out of one spreadsheet column (#1346).
 *
 * Budojo stores a phone as `phone_country_code` + `phone_national_number`,
 * both filled or both null (#75). No academy's sheet is shaped that way — it
 * has one column reading `+39 333 1234567`, or `333 1234567`, or a dash.
 *
 * Uses libphonenumber, which is already a dependency and already what
 * `ValidatesPhonePair` checks the result with. Splitting by hand would mean
 * a second, worse opinion about where a dial code ends — and the two would
 * disagree on exactly the numbers that are hard.
 *
 * **It splits; it does not judge.** Whether the resulting pair is a reachable
 * number stays `StoreAthleteRequest`'s decision, so there is one answer to
 * that question and the import cannot drift from the form. A number that
 * splits but is not valid comes back from validation with the phone message
 * it deserves, against the right field.
 */
final class PhoneText
{
    /**
     * Cells that mean "no phone" rather than a bad one. Worth naming: an
     * empty phone must import the athlete without one, not report the row —
     * the column is optional and a spreadsheet's way of saying so is rarely
     * an empty string.
     *
     * @var list<string>
     */
    private const BLANKS = ['', '-', '--', 'n/a', 'na', 'nd', 'n.d.', '/'];

    /**
     * @param string|null $fallbackCountryCode the academy's own dial code, used
     *                                         only when the cell carries none
     *
     * @return array{phone_country_code: string, phone_national_number: string}|null
     */
    public static function parse(?string $text, ?string $fallbackCountryCode): ?array
    {
        $trimmed = trim($text ?? '');
        if (\in_array(mb_strtolower($trimmed), self::BLANKS, true)) {
            return null;
        }

        // `0039 …` means `+39` in a spreadsheet cell, but libphonenumber
        // cannot know that without a region: `00` is an international ACCESS
        // code and which one applies depends on where you are dialling from
        // (011 in North America, 010 in Japan). So a `0039` written by an
        // academy that never filled in its own phone parses as nothing at all.
        // Rewriting the leading `00` to `+` is safe in the other direction:
        // no national number begins with `00`.
        $normalised = (string) preg_replace('/^00(?=\d)/', '+', $trimmed);

        $util = PhoneNumberUtil::getInstance();

        // libphonenumber wants a REGION ('IT'), not a dial code ('+39'), and
        // only consults it when the number carries no prefix of its own — so a
        // foreign member's `+44 …` still wins over the academy's default.
        $region = self::regionFor($util, $fallbackCountryCode);

        try {
            $number = $util->parse($normalised, $region);
        } catch (\Throwable) {
            return null;
        }

        $countryCode = $number->getCountryCode();
        $nationalNumber = $number->getNationalNumber();
        if ($countryCode === null || $nationalNumber === null) {
            // A bare number with no fallback: nothing here says which country
            // it belongs to, and defaulting to Italy because the app is
            // written in Italian would be inventing data.
            return null;
        }

        return [
            'phone_country_code' => '+' . $countryCode,
            'phone_national_number' => (string) $nationalNumber,
        ];
    }

    private static function regionFor(PhoneNumberUtil $util, ?string $dialCode): ?string
    {
        if ($dialCode === null || $dialCode === '') {
            return null;
        }

        $digits = ltrim($dialCode, '+');
        if (! ctype_digit($digits)) {
            return null;
        }

        $region = $util->getRegionCodeForCountryCode((int) $digits);

        // The library answers 'ZZ' for a dial code it does not map to one
        // region. Passing that through would be worse than passing nothing.
        return $region === 'ZZ' ? null : $region;
    }
}
