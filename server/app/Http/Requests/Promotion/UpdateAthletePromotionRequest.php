<?php

declare(strict_types=1);

namespace App\Http\Requests\Promotion;

use App\Authorization\Capability;
use App\Enums\Belt;
use App\Http\Requests\Concerns\AuthorizesAcademyCapability;
use App\Http\Requests\Concerns\ResolvesRankLadder;
use App\Http\Requests\Concerns\ValidatesPromotionChainConsistency;
use App\Models\Athlete;
use App\Models\AthletePromotion;
use App\Rules\BeltInLadder;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

class UpdateAthletePromotionRequest extends FormRequest
{
    use AuthorizesAcademyCapability;
    use ResolvesRankLadder;
    use ValidatesPromotionChainConsistency;

    /**
     * Correcting a promotion's date is an athlete-record edit — gated by
     * the same capability as any other athlete write, not a lesser tier
     * borrowed from the read-only history endpoint.
     */
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
        return [
            // `kind`, the belt/stripe transition, and who recorded it describe
            // the event itself and aren't in scope for a date correction
            // (#1431 PR 1 of 2). Date-only, matching the timeline's display
            // precision (`mediumDate`) — a promotion can't be recorded ahead
            // of today.
            'recorded_at' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            // The one exception (#1966): the belt a STARTING row's athlete
            // came from, which that row never recorded. Refused on any row
            // that already has one — see `withValidator()`.
            'from_belt' => ['sometimes', 'required', Rule::enum(Belt::class), new BeltInLadder($this->rankLadder())],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if (! $this->has('from_belt') || ! $validator->errors()->isEmpty()) {
                return;
            }

            $this->validateCompletingAStartingRow($validator);
        });
    }

    protected function failedAuthorization(): void
    {
        throw new HttpResponseException(
            response()->json(['message' => 'Forbidden.'], 403),
        );
    }

    /**
     * A first belt only completes the row a timeline opens with (#1771),
     * never rewrites a transition a row already records; it must differ from
     * the belt the row reached, and fit the history around it — which the
     * gap it completes guarantees, and the belt chain checks otherwise.
     */
    private function validateCompletingAStartingRow(Validator $validator): void
    {
        $athlete = $this->route('athlete');
        $promotion = $this->route('promotion');
        $recordedAt = $this->date('recorded_at');
        if (! $athlete instanceof Athlete || ! $promotion instanceof AthletePromotion || $recordedAt === null) {
            return;
        }

        if ($promotion->kind !== 'belt' || $promotion->from_belt !== null) {
            $validator->errors()->add('from_belt', 'Only a starting belt row can be given the belt it came from.');

            return;
        }

        $fromBelt = $this->input('from_belt');
        $toBelt = $promotion->to_belt?->value;
        if ($fromBelt === $toBelt) {
            $validator->errors()->add('from_belt', 'The belt it came from must differ from the belt it reached.');

            return;
        }

        $fields = ['kind' => 'belt', 'from_belt' => $fromBelt, 'to_belt' => $toBelt, 'completes' => $promotion->id];
        if (! $this->fillsAGap($athlete, $fields, $recordedAt)) {
            $this->validateBeltChain($validator, $athlete, $recordedAt, $fromBelt, $toBelt, editing: $promotion->id);
        }
    }
}
