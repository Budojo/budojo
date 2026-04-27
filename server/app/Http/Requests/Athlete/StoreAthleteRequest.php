<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete;

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use libphonenumber\NumberParseException;
use libphonenumber\PhoneNumberUtil;

class StoreAthleteRequest extends FormRequest
{
    public function authorize(): bool
    {
        $user = $this->user();

        return $user !== null && $user->academy !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $academyId = $this->user()?->academy?->id;

        return [
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'email' => [
                'nullable',
                'email',
                'max:255',
                Rule::unique('athletes', 'email')
                    ->where('academy_id', $academyId)
                    ->whereNull('deleted_at'),
            ],
            // Phone is a *pair* (#75): either both null OR both filled, with
            // a libphonenumber-validated combination. The shape rules here
            // catch the "only one set" case; the cross-field reachability
            // check lives in `withValidator()` below.
            'phone_country_code' => [
                'nullable',
                'string',
                'regex:/^\+[1-9][0-9]{0,3}$/',
                'required_with:phone_national_number',
            ],
            'phone_national_number' => [
                'nullable',
                'string',
                'regex:/^[0-9]+$/',
                'max:20',
                'required_with:phone_country_code',
            ],
            'date_of_birth' => ['nullable', 'date', 'before:today'],
            'belt' => ['required', Rule::enum(Belt::class)],
            'stripes' => ['integer', 'min:0', 'max:4'],
            'status' => ['required', Rule::enum(AthleteStatus::class)],
            'joined_at' => ['required', 'date'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        validatePhonePairWithLibphonenumber($this, $validator);
    }
}

/**
 * Cross-field libphonenumber check shared by Store + Update form requests.
 * When both `phone_country_code` and `phone_national_number` are present,
 * concatenates them, parses with libphonenumber, and rejects unreachable /
 * invalid combinations (e.g. an Italian number prefix with a UK-shaped
 * national digit count). Lives at the file-namespace level so both request
 * classes can call it without duplicating the closure body.
 */
function validatePhonePairWithLibphonenumber(FormRequest $request, Validator $validator): void
{
    $validator->after(function (Validator $v) use ($request): void {
        $cc = $request->input('phone_country_code');
        $nn = $request->input('phone_national_number');
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
