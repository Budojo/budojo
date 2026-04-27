<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete;

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Models\Athlete;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateAthleteRequest extends FormRequest
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
            // Phone pair (#75) — same shape as StoreAthleteRequest. The
            // `sometimes` tier means a PUT that omits both keys leaves the
            // existing pair untouched; sending one half explicitly is still
            // rejected by `required_with`.
            'phone_country_code' => [
                'sometimes',
                'nullable',
                'string',
                'regex:/^\+[1-9][0-9]{0,3}$/',
                'required_with:phone_national_number',
            ],
            'phone_national_number' => [
                'sometimes',
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
        ];
    }

    public function withValidator(Validator $validator): void
    {
        validatePhonePairWithLibphonenumber($this, $validator);
    }
}
