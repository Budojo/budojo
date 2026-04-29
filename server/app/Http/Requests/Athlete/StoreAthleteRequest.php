<?php

declare(strict_types=1);

namespace App\Http\Requests\Athlete;

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Http\Requests\Concerns\ValidatesAddress;
use App\Http\Requests\Concerns\ValidatesPhonePair;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
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
            // Contact links (#162) — three independently nullable URLs.
            // Same shape as the academy variant; see UpdateAcademyRequest
            // for the `url`-vs-handle reasoning.
            'website' => ['nullable', 'url', 'max:255'],
            'facebook' => ['nullable', 'url', 'max:255'],
            'instagram' => ['nullable', 'url', 'max:255'],
            'date_of_birth' => ['nullable', 'date', 'before:today'],
            'belt' => ['required', Rule::enum(Belt::class)],
            // Global cap is 6 (the maximum among all belts — Black has 6
            // graus, every other belt has 4). The per-belt cap is enforced
            // cross-field in `withValidator` below via `Belt::maxStripes()`.
            'stripes' => ['integer', 'min:0', 'max:6'],
            'status' => ['required', Rule::enum(AthleteStatus::class)],
            'joined_at' => ['required', 'date'],
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
     * FormRequest (UpdateAcademyRequest, UpdateDocumentRequest,
     * MarkAttendanceRequest): `{"message":"Forbidden."}`. Without this
     * override, Laravel falls back to "This action is unauthorized.", which
     * mismatches both the OpenAPI spec (`ForbiddenAthleteWrite`) and the SPA's
     * 403 handling.
     */
    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }

    /**
     * Enforces the per-belt stripes cap (#229). The static `max:6` rule
     * lets a 6-stripes value through globally; this check rejects e.g.
     * a 5-stripes blue belt — only black supports 5-6 graus.
     */
    private function validateStripesAgainstBelt(Validator $validator): void
    {
        $beltValue = $this->input('belt');
        if (! \is_string($beltValue)) {
            return;
        }
        $belt = Belt::tryFrom($beltValue);
        if ($belt === null) {
            return;
        }
        $stripes = $this->integer('stripes');
        if ($stripes > $belt->maxStripes()) {
            $validator->errors()->add(
                'stripes',
                "The {$belt->value} belt allows at most {$belt->maxStripes()} stripes.",
            );
        }
    }
}
