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
use App\Support\OperatorDay;
use App\Support\Promotion\PromotionGaps;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Validation\Rule;

/**
 * @phpstan-import-type Gap from PromotionGaps
 */
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
            'recorded_at' => ['required', 'date_format:Y-m-d', OperatorDay::notAfterToday()],
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
     * the belt the row reached, and fit the history around it.
     *
     * When a gap stands for this row, its window is binding (#1966): dated
     * outside it, the belt would land after rows that came on that belt, and
     * the history would then offer the same belt again. Inside it, the gap's
     * own `from_belt` is consistent by construction; any other goes through
     * the belt chain. With no gap — the row that opens the history — the
     * belt chain decides alone.
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

        $gap = $this->gapCompleting($athlete, $promotion);
        if ($gap !== null && ! PromotionGaps::inWindow($gap, $recordedAt->toDateString(), OperatorDay::today())) {
            $validator->errors()->add('recorded_at', self::windowMessage($gap));

            return;
        }

        if ($gap === null || $fromBelt !== $gap['from_belt']) {
            $this->validateBeltChain($validator, $athlete, $recordedAt, $fromBelt, $toBelt, editing: $promotion->id);
        }
    }

    /**
     * @return Gap|null
     */
    private function gapCompleting(Athlete $athlete, AthletePromotion $promotion): ?array
    {
        foreach ($this->promotionGaps($athlete) as $gap) {
            if ($gap['completes_promotion_id'] === $promotion->id) {
                return $gap;
            }
        }

        return null;
    }

    /** @param Gap $gap */
    private static function windowMessage(array $gap): string
    {
        $after = $gap['after']['recorded_at'] ?? null;
        $before = $gap['before']['recorded_at'] ?? null;

        return match (true) {
            $after !== null && $before !== null => "Must be after {$after} and no later than {$before}.",
            $after !== null => "Must be after {$after}.",
            $before !== null => "Must be no later than {$before}.",
            default => 'Must not be in the future.',
        };
    }
}
