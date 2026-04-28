<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

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
 */
trait ValidatesPhonePair
{
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
