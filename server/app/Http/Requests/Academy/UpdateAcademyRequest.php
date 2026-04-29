<?php

declare(strict_types=1);

namespace App\Http\Requests\Academy;

use App\Http\Requests\Concerns\ValidatesAddress;
use App\Http\Requests\Concerns\ValidatesPhonePair;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class UpdateAcademyRequest extends FormRequest
{
    use ValidatesAddress;
    use ValidatesPhonePair;

    /**
     * Ownership gate: the authenticated user must own an academy.
     * Mirrors UpdateDocumentRequest::authorize() so the FormRequest owns
     * the entire authorization contract — the controller stays a humble
     * orchestrator (server/CLAUDE.md § Clean Architecture).
     *
     * `slug` is intentionally immutable by design (keeps permalinks stable
     * across renames) and therefore absent from the rules below.
     */
    public function authorize(): bool
    {
        $user = $this->user();

        return $user !== null && $user->academy !== null;
    }

    /**
     * Only `name`, `address`, `monthly_fee_cents`, and `training_days` are
     * updateable. `slug` is immutable; `user_id` is set at creation. Laravel's
     * `validated()` excludes any key without a rule, so those fields cannot
     * reach `$academy->update($validated)`.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            // Phone is a *pair* (#161, mirrors the athlete shape from #75):
            // either both null or both filled, with a libphonenumber-validated
            // combination. We do NOT add `sometimes` on these two on purpose
            // (same lesson as UpdateAthleteRequest): with `sometimes` set, a
            // PATCH that includes only ONE half of the pair would skip the
            // missing field's rules entirely, and `required_with` would never
            // fire. Without it, both rules always run; an absent pair sails
            // through (`nullable` + neither-side-present means no
            // `required_with` triggers), but a half-filled PATCH is rejected
            // exactly as on the create endpoint.
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
            // Contact links (#162) — three independently nullable URL
            // columns. `url` enforces a parseable scheme (`http://` or
            // `https://`), so users can't paste a bare `@handle` and
            // expect it to render as a clickable link on the SPA. Each
            // field is independent — no all-or-nothing pairing like the
            // phone columns.
            'website' => ['sometimes', 'nullable', 'url', 'max:255'],
            'facebook' => ['sometimes', 'nullable', 'url', 'max:255'],
            'instagram' => ['sometimes', 'nullable', 'url', 'max:255'],
            // Cents — `integer` rejects "9.5" / floats; `min:0` blocks
            // negatives (refunds/discounts would be a different concept).
            // No upper bound — let the academy own the absurdity check.
            'monthly_fee_cents' => ['sometimes', 'nullable', 'integer', 'min:0'],
            // Carbon dayOfWeek convention (0=Sun..6=Sat). See StoreAcademyRequest
            // for the same shape — kept in sync because both endpoints feed
            // the same column on the model. `min:1` keeps "not configured"
            // canonically as `null` rather than admitting `[]` as a distinct
            // ambiguous state.
            'training_days' => ['sometimes', 'nullable', 'array', 'min:1', 'max:7'],
            'training_days.*' => ['integer', 'between:0,6', 'distinct'],
            ...$this->addressRules(),
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $this->validatePhonePairWithLibphonenumber($validator);
    }

    /**
     * Match the wire-level contract used by the rest of the API for
     * ownership failures: `{"message":"Forbidden."}` with 403 — same JSON
     * that DocumentController / UpdateDocumentRequest emit. Without this
     * override Laravel would render "This action is unauthorized." and
     * break the contract.
     */
    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }
}
