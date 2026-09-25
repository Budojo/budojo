<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Support\PhonePair;
use Illuminate\Contracts\Validation\Validator;
use libphonenumber\NumberParseException;
use libphonenumber\PhoneNumberUtil;

/**
 * Cross-field libphonenumber check shared by phone-pair-bearing FormRequests:
 * Athlete (#75) and Academy (#161). Originally lived under
 * `App\Http\Requests\Athlete\Concerns` — promoted to the shared namespace
 * once the second consumer landed (Rule of Three says wait for the third,
 * but a domain-language trait is cheap to relocate and keeps the mental
 * model honest: phone validation isn't athlete-specific).
 *
 * The shape rules in `rules()` already enforce the "both filled or both null"
 * pair; this trait adds the reachability check (e.g. a `+39` prefix with a
 * national digit count that doesn't match any Italian numbering plan).
 *
 * It also normalises what is stored (#1867): call `normalisePhonePair()` from
 * `prepareForValidation()`, and a valid pair is rewritten to its national
 * significant number before the rules see it (`PhonePair`).
 */
trait ValidatesPhonePair
{
    /**
     * Rewrite a valid pair's national part to its national significant
     * number: `+44` / `07911123456` becomes `7911123456`, and an Italian
     * `061234567` stays as it is.
     *
     * Only digits are touched, so the shape rules still judge exactly what
     * was sent — libphonenumber would happily read letters and spaces, and
     * the contract says digits. An invalid pair is left as typed, so the
     * reachability error below names the number the person entered.
     */
    protected function normalisePhonePair(): void
    {
        $cc = $this->input('phone_country_code');
        $nn = $this->input('phone_national_number');
        if (! \is_string($cc) || ! \is_string($nn) || $cc === '' || ! ctype_digit($nn)) {
            return;
        }

        $significant = PhonePair::nationalSignificant($cc, $nn);
        if ($significant !== null) {
            $this->merge(['phone_national_number' => $significant]);
        }
    }

    protected function validatePhonePairWithLibphonenumber(Validator $validator): void
    {
        $validator->after(function (Validator $v): void {
            $cc = $this->input('phone_country_code');
            $nn = $this->input('phone_national_number');
            if (! \is_string($cc) || ! \is_string($nn) || $cc === '' || $nn === '') {
                return;
            }

            try {
                $parsed = PhoneNumberUtil::getInstance()->parse($cc . $nn, null);
            } catch (NumberParseException) {
                $v->errors()->add('phone_national_number', 'The phone number is not in a recognised format.');

                return;
            }

            if (! PhoneNumberUtil::getInstance()->isValidNumber($parsed)) {
                $v->errors()->add('phone_national_number', 'The phone number is not valid for the selected country code.');
            }
        });
    }
}
