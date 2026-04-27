<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete\Concerns;

use Illuminate\Contracts\Validation\Validator;
use libphonenumber\NumberParseException;
use libphonenumber\PhoneNumberUtil;

/**
 * Cross-field libphonenumber check shared by `StoreAthleteRequest` and
 * `UpdateAthleteRequest`. Lives in its own autoloadable namespace so that
 * loading either request class is enough to make the validator available —
 * the previous file-scope-function shape only worked when `StoreAthleteRequest`
 * happened to be loaded first, which broke the update endpoint in isolation.
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
