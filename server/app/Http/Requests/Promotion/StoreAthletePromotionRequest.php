<?php

declare(strict_types=1);

namespace App\Http\Requests\Promotion;

use App\Authorization\Capability;
use App\Enums\Belt;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Http\Requests\Concerns\ResolvesRankLadder;
use App\Http\Requests\Concerns\ValidatesPromotionChainConsistency;
use App\Models\Athlete;
use App\Rules\BeltInLadder;
use App\Rules\StripesWithinGrade;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

/**
 * Backfills a historical promotion (#1431 PR 2 of 2) — the piece that lets
 * an academy transcribe a paper register: promotions that happened before
 * Budojo existed, for both belts and stripes.
 *
 * `belt_at_event` is NOT accepted for `kind = belt` — it always equals
 * `to_belt` on a belt row (docs/entities/athlete-promotion.md), so the
 * controller derives it rather than trusting a second, possibly-
 * disagreeing input for the same fact.
 */
class StoreAthletePromotionRequest extends FormRequest
{
    use AuthorizesAcademyCapability;
    use ResolvesRankLadder;
    use ValidatesPromotionChainConsistency;

    public function authorize(): bool
    {
        $athlete = $this->route('athlete');
        if (! $athlete instanceof Athlete) {
            return false;
        }

        return $this->authorizeInAcademy($athlete->academy_id, Capability::AthletesCreateUpdate);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        // History is judged against the athlete's academy's ladder (#1800): a
        // transcribed paper register from a judo dojo cannot contain a purple.
        $inLadder = new BeltInLadder($this->rankLadder());
        // The cap of the grade the stripes were counted on — `belt_at_event`,
        // not the athlete's belt today.
        $withinGrade = new StripesWithinGrade($this->rankLadder(), beltField: 'belt_at_event');

        return [
            'kind' => ['required', Rule::in(['belt', 'stripe'])],
            // Date-only, matching PR 1's edit endpoint and the timeline's
            // own display precision. A promotion can't be recorded ahead
            // of today even when it is being entered late.
            'recorded_at' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'from_belt' => ['nullable', 'prohibited_unless:kind,belt', Rule::enum(Belt::class), $inLadder],
            'to_belt' => ['required_if:kind,belt', 'prohibited_unless:kind,belt', Rule::enum(Belt::class), $inLadder],
            'from_stripes' => ['required_if:kind,stripe', 'prohibited_unless:kind,stripe', 'integer', 'min:0', 'max:10', $withinGrade],
            'to_stripes' => ['required_if:kind,stripe', 'prohibited_unless:kind,stripe', 'integer', 'min:0', 'max:10', $withinGrade],
            'belt_at_event' => ['required_if:kind,stripe', 'prohibited_unless:kind,stripe', Rule::enum(Belt::class), $inLadder],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            $this->validateNoOpTransition($validator);
            // Skip the (expensive, DB-querying) chain check once the shape
            // rules above have already failed — there is nothing coherent
            // to compare against yet.
            if (! $validator->errors()->isEmpty()) {
                return;
            }
            $this->validatePromotionChainConsistency($validator);
        });
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }

    /**
     * A "promotion" where nothing changed isn't one. Belt allows a null
     * `from_belt` (first assignment); stripes never have an equivalent
     * "no prior count" state, so `from_stripes` is always a real number.
     */
    private function validateNoOpTransition(Validator $validator): void
    {
        if ($this->input('kind') === 'belt' && $this->input('from_belt') === $this->input('to_belt')) {
            $validator->errors()->add('to_belt', 'The new belt must differ from the previous one.');
        }

        if ($this->input('kind') === 'stripe'
            && $this->has(['from_stripes', 'to_stripes'])
            && $this->input('from_stripes') === $this->input('to_stripes')) {
            $validator->errors()->add('to_stripes', 'The new stripe count must differ from the previous one.');
        }
    }
}
