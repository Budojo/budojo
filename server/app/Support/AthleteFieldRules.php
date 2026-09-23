<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Enums\BillingPeriod;
use App\Rules\BeltInLadder;
use App\Rules\StripesWithinGrade;
use App\Support\MartialArt\RankLadder;
use Illuminate\Validation\Rule;

/**
 * The validation rules for an athlete's own fields, in one place (#1346).
 *
 * Extracted from `StoreAthleteRequest` when the CSV import needed to answer
 * the same question — *is this row a legal athlete?* — before writing
 * anything. Copying the rules would have created two definitions of what a
 * valid athlete is, and the copy would have been the one nobody updated: the
 * next rule added to the form would silently not apply to the import, and the
 * import is the path that creates sixty records at once.
 *
 * **Lives in `Support`, not under `Http`, because of the Dependency Rule.**
 * `ImportAthletesAction` is a use case and must not depend on the HTTP layer;
 * a FormRequest is an interface adapter and may depend inward on this. Both
 * point at the same centre, neither at the other.
 *
 * Address rules are deliberately *not* here — they come from
 * `ValidatesAddress::addressRules()` and belong to the form, which is the only
 * surface that collects one. Nor is the phone-pair reachability check, which
 * lives in the `ValidatesPhonePair` trait. The stripe cap per grade **is**
 * here (`StripesWithinGrade`, #1800): it was a request-only trait until then,
 * and the import — which never ran it — accepted any count up to the ceiling.
 */
final class AthleteFieldRules
{
    /**
     * @param int|null $academyId scopes the unique-email check and the fee-tier
     *                            existence check; null in the (unreachable in
     *                            practice) case of a user with no academy, which
     *                            `authorize()` has already refused
     * @param RankLadder $ladder the academy's martial art's ladder (#1800) — a
     *                           belt must be a colour that art awards
     *
     * @return array<string, mixed>
     */
    public static function for(?int $academyId, RankLadder $ladder): array
    {
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
            // check lives in `ValidatesPhonePair`.
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
            'belt' => ['required', Rule::enum(Belt::class), new BeltInLadder($ladder)],
            // Global ceiling across every ladder (#1800) — taekwondo's black
            // counts 1st-9th dan as 0-8 — and the cap of the row's own grade,
            // which the CSV import needs as much as the form does.
            'stripes' => ['integer', 'min:0', 'max:10', new StripesWithinGrade($ladder)],
            'status' => ['required', Rule::enum(AthleteStatus::class)],
            'joined_at' => ['required', 'date'],
            // Which price tier the athlete starts on (#1381). Optional: an
            // athlete on none pays the academy's flat fee, which is every
            // athlete an academy has today.
            // How often this athlete is expected to pay (#1382). Monthly for
            // everyone until someone changes it.
            'billing_period_months' => ['sometimes', 'integer', Rule::enum(BillingPeriod::class)],
            'fee_tier_id' => [
                'sometimes', 'nullable', 'integer',
                Rule::exists('academy_fee_tiers', 'id')->where('academy_id', $academyId),
            ],
        ];
    }
}
