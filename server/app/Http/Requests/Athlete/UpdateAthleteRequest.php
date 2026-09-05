<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete;

use App\Authorization\Capability;
use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Http\Requests\Concerns\ValidatesAddress;
use App\Http\Requests\Concerns\ValidatesPhonePair;
use App\Http\Requests\Concerns\ValidatesStripesAgainstBelt;
use App\Models\Athlete;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

class UpdateAthleteRequest extends FormRequest
{
    use AuthorizesAcademyCapability;
    use ValidatesAddress;
    use ValidatesPhonePair;
    use ValidatesStripesAgainstBelt;

    public function authorize(): bool
    {
        /** @var Athlete|null $athlete */
        $athlete = $this->route('athlete');
        if (! $athlete instanceof Athlete) {
            return false;
        }

        // Route-bound: capability check uses the athlete's actual
        // academy, NOT the caller's active one. Otherwise a user
        // with capability in academy A could pass FormRequest
        // validation for an athlete in academy B.
        return $this->authorizeInAcademy($athlete->academy_id, Capability::AthletesCreateUpdate);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        /** @var Athlete|null $athlete */
        $athlete = $this->route('athlete');
        // Scope the unique-email rule to the athlete's actual
        // academy — not the caller's active one — so duplicates
        // in the athlete's tenant are caught regardless of which
        // academy the caller is currently switched to.
        $academyId = $athlete?->academy_id;

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
            // Contact links (#162) — three independently nullable URLs.
            // Same shape as the create / academy variants.
            'website' => ['sometimes', 'nullable', 'url', 'max:255'],
            'facebook' => ['sometimes', 'nullable', 'url', 'max:255'],
            'instagram' => ['sometimes', 'nullable', 'url', 'max:255'],
            'date_of_birth' => ['sometimes', 'nullable', 'date', 'before:today'],
            'belt' => ['sometimes', Rule::enum(Belt::class)],
            // Global cap is 6 (the maximum among all belts — Black has 6
            // graus, every other belt has 4). The per-belt cap is enforced
            // cross-field in `withValidator` below — it considers the belt
            // from the request OR, if absent, the existing athlete's belt.
            'stripes' => ['sometimes', 'integer', 'min:0', 'max:6'],
            'status' => ['sometimes', Rule::enum(AthleteStatus::class)],
            'joined_at' => ['sometimes', 'date'],
            // Which price tier the athlete is on (#1381). Scoped to their own
            // academy: attaching academy B's tier to academy A's athlete would
            // make the fee resolve to a price the owner cannot even see.
            'fee_tier_id' => [
                'sometimes', 'nullable', 'integer',
                Rule::exists('academy_fee_tiers', 'id')->where('academy_id', $academyId),
            ],
            ...$this->addressRules(),
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $this->validatePhonePairWithLibphonenumber($validator);
        $this->validateStripesAgainstBelt($validator);
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
