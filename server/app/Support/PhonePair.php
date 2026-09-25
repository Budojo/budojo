<?php

declare(strict_types=1);

namespace App\Support;

use libphonenumber\NumberParseException;
use libphonenumber\PhoneNumberUtil;

/**
 * The phone pair as Budojo stores it (#75, #1867): `phone_country_code` plus
 * the **national significant number**, so the two together are the number in
 * E.164 — what the `tel:` and `wa.me` links read (#1727).
 *
 * The national significant number is not what a person types. It drops a
 * trunk zero (`+44 07911…` → `7911…`; WhatsApp refuses `4407911…`) and keeps
 * an Italian landline's leading zero (`+39 06…` stays `06…`; without it the
 * number dials a different line). libphonenumber knows both rules; nobody
 * should re-implement them.
 */
final class PhonePair
{
    /**
     * The national significant number of a valid pair, or null when the pair
     * does not make a valid number — which is validation's to report, against
     * what the person typed.
     */
    public static function nationalSignificant(string $countryCode, string $nationalNumber): ?string
    {
        $util = PhoneNumberUtil::getInstance();

        try {
            $number = $util->parse($countryCode . $nationalNumber, null);
        } catch (NumberParseException) {
            return null;
        }

        return $util->isValidNumber($number) ? $util->getNationalSignificantNumber($number) : null;
    }
}
