<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete;

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Http\Requests\Athlete\Concerns\ValidatesPhonePair;
use App\Http\Requests\Concerns\ValidatesAddress;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreAthleteRequest extends FormRequest
{
    use ValidatesAddress;
    use ValidatesPhonePair;

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
            ...$this->addressRules(),
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $this->validatePhonePairWithLibphonenumber($validator);
    }
}
