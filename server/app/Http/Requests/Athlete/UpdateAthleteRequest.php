<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete;

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Http\Requests\Concerns\ValidatesAddress;
use App\Http\Requests\Concerns\ValidatesPhonePair;
use App\Models\Athlete;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

class UpdateAthleteRequest extends FormRequest
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

        /** @var Athlete|null $athlete */
        $athlete = $this->route('athlete');

        return [
            'first_name' => ['sometimes', 'string', 'max:100'],
            'last_name' => ['sometimes', 'string', 'max:100'],
            'email' => [
                'sometimes',
                'nullable',
                'email',
                'max:255',
                Rule::unique('athletes', 'email')
                    ->where('academy_id', $academyId)
                    ->ignore($athlete?->id)
                    ->whereNull('deleted_at'),
            ],
            // Phone pair (#75) — same shape as StoreAthleteRequest. We do
            // NOT add `sometimes` here on purpose: with `sometimes` set, a
            // PUT that includes only ONE half of the pair would skip the
            // missing field's rules entirely, and `required_with` would never
            // fire. Without it, both rules always run; an absent pair sails
            // through (`nullable` + neither-side-present means no
            // `required_with` triggers), but a half-filled pair is rejected
            // exactly as it is on the create endpoint.
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
            'date_of_birth' => ['sometimes', 'nullable', 'date', 'before:today'],
            'belt' => ['sometimes', Rule::enum(Belt::class)],
            'stripes' => ['sometimes', 'integer', 'min:0', 'max:4'],
            'status' => ['sometimes', Rule::enum(AthleteStatus::class)],
            'joined_at' => ['sometimes', 'date'],
            ...$this->addressRules(),
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $this->validatePhonePairWithLibphonenumber($validator);
    }

    /**
     * Match the canonical wire-level 403 contract used by every other write
     * FormRequest: `{"message":"Forbidden."}`. See StoreAthleteRequest for the
     * full reasoning.
     */
    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
