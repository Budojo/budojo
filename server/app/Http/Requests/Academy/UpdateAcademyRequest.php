<?php

declare(strict_types=1);

namespace App\Http\Requests\Academy;

use App\Authorization\Capability;
use App\Enums\CarnetEntryUnit;
use App\Enums\MartialArt;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Http\Requests\Concerns\ValidatesAddress;
use App\Http\Requests\Concerns\ValidatesPhonePair;
use App\Support\MartialArt\MartialArtLock;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

class UpdateAcademyRequest extends FormRequest
{
    use AuthorizesAcademyCapability;
    use ValidatesAddress;
    use ValidatesPhonePair;

    /**
     * Capability gate: the authenticated user must have
     * `AcademySettingsUpdate` in their currently-active academy. After
     * the multi-user migration this is `Owner` + `Admin` per
     * `RoleCapabilities::MATRIX`; `Instructor` and `Assistant` are
     * read-only on settings.
     *
     * `slug` is intentionally immutable by design (keeps permalinks stable
     * across renames) and therefore absent from the rules below.
     */
    public function authorize(): bool
    {
        return $this->authorizeActiveAcademy(Capability::AcademySettingsUpdate);
    }

    /**
     * The settings an owner can change. `slug` is immutable; `user_id` is
     * set at creation. Laravel's
     * `validated()` excludes any key without a rule, so those fields cannot
     * reach `$academy->update($validated)`.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'name' => ['sometimes', 'required', 'string', 'max:255'],
            // Changeable only while nothing in the academy is shaped by it —
            // see `validateMartialArtLock()` below and `MartialArtLock`.
            'martial_art' => ['sometimes', 'required', Rule::enum(MartialArt::class)],
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
            // The carnet offering. Null on either half means "this academy
            // doesn't sell carnets" — selling one is refused until both are
            // set. A pack of zero entries would be sellable but unusable.
            'carnet_price_cents' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'carnet_entries' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:255'],
            // What one entry pays for (#1576) — a lesson or the whole day.
            // Never null: every academy has an answer, `lesson` until it
            // says otherwise, so there is no "not configured" to express.
            'carnet_entry_unit' => ['sometimes', Rule::enum(CarnetEntryUnit::class)],
            // Carbon dayOfWeek convention (0=Sun..6=Sat). See StoreAcademyRequest
            // for the same shape — kept in sync because both endpoints feed
            // the same column on the model. `min:1` keeps "not configured"
            // canonically as `null` rather than admitting `[]` as a distinct
            // ambiguous state.
            // While the timetable has classes the days come from it (#1575)
            // and a hand-set value would be overwritten by the next class
            // change — refusing it says so, instead of accepting a write
            // that does not stick. `missing`, not `prohibited`: prohibited
            // only fails on a non-empty value, and `null` would slip through
            // and blank the days.
            'training_days' => Rule::when(
                fn (): bool => $this->user()?->activeAcademy()?->classes()->exists() ?? false,
                ['missing'],
                ['sometimes', 'nullable', 'array', 'min:1', 'max:7'],
            ),
            'training_days.*' => ['integer', 'between:0,6', 'distinct'],
            // The month the training year restarts in (#1484). Nullable, and
            // null is not "no season" — it is "nobody has said", which
            // App\Support\Season answers with September. A season is not
            // optional the way a carnet is: every academy has one whether or
            // not it has an opinion about it.
            'season_start_month' => ['sometimes', 'nullable', 'integer', 'between:1,12'],
            // Whether the academy has a kids' programme (#1651). It trims the
            // SPA's belt pickers; the server takes a youth belt either way.
            'trains_kids' => ['sometimes', 'boolean'],
            // The month fees start being recorded here (#1742). A date, taken
            // as given and pinned to the 1st by the Action — the form offers a
            // month, and a floor that moved with the day it was set would be a
            // different rule on the 15th than on the 1st.
            //
            // Never in the future. "Fees are recorded here from next October"
            // is not a statement anyone can act on, and it desynchronises the
            // ledger from everything else that decides unpaid: the roster's
            // `?paid=no`, the owner digest and the athlete overdue push all
            // answer for the CURRENT month without a floor, so a future one
            // would blank a month in the ledger while those three still chased
            // it. The rule lives here, once, rather than in four consumers —
            // and deliberately NOT in the picker, where a `maxDate` silently
            // blanked an already-stored future value instead of showing it.
            'billing_from' => ['sometimes', 'nullable', 'date', 'before_or_equal:today'],
            ...$this->addressRules(),
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'training_days.missing' => 'Training days come from the timetable while it has classes.',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $this->validatePhonePairWithLibphonenumber($validator);
        $validator->after(fn (Validator $validator) => $this->validateMartialArtLock($validator));
    }

    /** The phone is stored as its national significant number (#1867). */
    protected function prepareForValidation(): void
    {
        $this->normalisePhonePair();
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

    /**
     * Refuses a *change* of martial art once the academy has anything shaped by
     * the old one (#1800). Sending the value it already has is accepted: a
     * form that posts every field should not fail on the one it did not touch.
     */
    private function validateMartialArtLock(Validator $validator): void
    {
        $requested = MartialArt::tryFrom(\is_string($this->input('martial_art')) ? $this->input('martial_art') : '');
        $academy = $this->user()?->activeAcademy();
        if ($requested === null || $academy === null || $requested === $academy->martial_art) {
            return;
        }

        if (MartialArtLock::isLocked($academy)) {
            $validator->errors()->add(
                'martial_art',
                'The martial art is set once the academy has athletes, classes, lessons or a programme.',
            );
        }
    }
}
