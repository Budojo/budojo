<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Actions\Promotion\GetPromotionGapsAction;
use App\Models\Athlete;
use App\Models\AthletePromotion;
use App\Support\OperatorDay;
use App\Support\Promotion\PromotionGaps;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Validation\Validator;

/**
 * Cross-field rule for backfilling promotion history (#1431 PR 2 of 2).
 *
 * The issue's own open question: what happens when a backfilled promotion
 * contradicts the athlete's existing history around it — a 2019 blue-belt
 * row inserted after an existing black-belt row, say. The product decision
 * (recorded explicitly, not assumed): REFUSE, with a specific error naming
 * the row it disagrees with. Silently allowing it would let the timeline
 * contradict itself; a soft warning would let an owner click through a
 * contradiction without noticing.
 *
 * **Scope, deliberately narrow**: each kind (`belt`, `stripe`) is checked
 * against its OWN same-kind neighbours only — a stripe row is never
 * cross-checked against belt rows, even though a real belt promotion
 * resets stripes to 0. Modelling that interaction would mean either
 * auto-inserting a companion stripe-reset row on every belt backfill (not
 * what the owner asked for) or rejecting historically-accurate stripe
 * entries whenever an unrelated belt row happens to sit between them.
 * Neither is what "add a past promotion" should feel like for someone
 * transcribing an incomplete paper register.
 *
 * A row with NO same-kind predecessor (or successor) is unconstrained on
 * that side — that is the legitimate "earliest/latest known event of this
 * kind" case, most commonly an athlete who joined already holding a belt
 * or stripe count Budojo never generated a row for.
 *
 * **A row that fills a gap exactly is consistent by construction (#1966).**
 * The gaps are the steps the ladder walks through between the rows that
 * exist, so one of them, dated inside its window, cannot contradict its
 * neighbours — even where this narrower check would say otherwise: the
 * first stripe on a new belt after the old belt's stripes, or the middle of
 * three missing stripes filled before its neighbours. Anything else is
 * checked exactly as before.
 *
 * @phpstan-import-type Gap from PromotionGaps
 */
trait ValidatesPromotionChainConsistency
{
    protected function validatePromotionChainConsistency(Validator $validator): void
    {
        $kind = $this->input('kind');
        if (! \in_array($kind, ['belt', 'stripe'], true)) {
            return; // the shape rule on `kind` already failed separately
        }

        $athlete = $this->route('athlete');
        if (! $athlete instanceof Athlete) {
            return;
        }

        $recordedAt = $this->date('recorded_at');
        if ($recordedAt === null) {
            return; // the shape rule on `recorded_at` already failed separately
        }

        $fields = $this->only(['kind', 'from_belt', 'to_belt', 'from_stripes', 'to_stripes', 'belt_at_event']);
        if ($this->fillsAGap($athlete, $fields, $recordedAt)) {
            return;
        }

        $kind === 'belt'
            ? $this->validateBeltChain($validator, $athlete, $recordedAt, $this->input('from_belt'), $this->input('to_belt'))
            : $this->validateStripeChain($validator, $athlete, $recordedAt);
    }

    /**
     * Whether this row is exactly one of the athlete's missing steps, dated
     * inside its window ({@see PromotionGaps::admits()}).
     *
     * @param array<string, mixed> $fields
     */
    protected function fillsAGap(Athlete $athlete, array $fields, CarbonInterface $recordedAt): bool
    {
        return PromotionGaps::admits($this->promotionGaps($athlete), $fields, $recordedAt->toDateString(), OperatorDay::today());
    }

    /**
     * The steps this athlete's history is missing, as the timeline reports them.
     *
     * @return list<Gap>
     */
    protected function promotionGaps(Athlete $athlete): array
    {
        return app(GetPromotionGapsAction::class)->execute($athlete)['gaps'];
    }

    /**
     * @param int|null $editing the row being edited, which is never its own neighbour
     */
    protected function validateBeltChain(
        Validator $validator,
        Athlete $athlete,
        CarbonInterface $recordedAt,
        mixed $fromBelt,
        mixed $toBelt,
        ?int $editing = null,
    ): void {
        $previous = $this->neighbour($athlete, 'belt', $recordedAt, earlier: true, editing: $editing);
        if ($previous !== null && $fromBelt !== $previous->to_belt?->value) {
            $validator->errors()->add(
                'from_belt',
                "Doesn't match the belt after the previous promotion on {$previous->recorded_at->toDateString()} ({$previous->to_belt?->value}).",
            );
        }

        $next = $this->neighbour($athlete, 'belt', $recordedAt, earlier: false, editing: $editing);
        // A later row with no `from_belt` is a starting point — every timeline
        // opens with one (#1771). It says which belt was held that day and
        // nothing about how, so it constrains nothing before it: a paper
        // register entered oldest-first ends below it until the last row is
        // in, and an incomplete one (blue in 2019, the promotion to purple
        // never written down) may never reach it at all.
        if ($next !== null && $next->from_belt !== null && $toBelt !== $next->from_belt->value) {
            $validator->errors()->add(
                'to_belt',
                "Doesn't match the belt before the next promotion on {$next->recorded_at->toDateString()} ({$next->from_belt->value}).",
            );
        }
    }

    private function validateStripeChain(Validator $validator, Athlete $athlete, CarbonInterface $recordedAt): void
    {
        // `is_numeric` narrows `mixed` before the cast (PHPStan level 9);
        // a non-numeric value already fails the shape rule separately, so
        // falling back to null here just skips this cross-check rather
        // than duplicating that error.
        $fromStripesRaw = $this->input('from_stripes');
        $fromStripes = is_numeric($fromStripesRaw) ? (int) $fromStripesRaw : null;
        $toStripesRaw = $this->input('to_stripes');
        $toStripes = is_numeric($toStripesRaw) ? (int) $toStripesRaw : null;

        $previous = $this->neighbour($athlete, 'stripe', $recordedAt, earlier: true);
        if ($previous !== null && $fromStripes !== $previous->to_stripes) {
            $validator->errors()->add(
                'from_stripes',
                "Doesn't match the stripe count after the previous promotion on {$previous->recorded_at->toDateString()} ({$previous->to_stripes}).",
            );
        }

        $next = $this->neighbour($athlete, 'stripe', $recordedAt, earlier: false);
        if ($next !== null && $toStripes !== $next->from_stripes) {
            $validator->errors()->add(
                'to_stripes',
                "Doesn't match the stripe count before the next promotion on {$next->recorded_at->toDateString()} ({$next->from_stripes}).",
            );
        }
    }

    /**
     * The nearest same-kind row on one side of `$recordedAt`. A same-day
     * existing row counts as the earlier one — the new row is treated as
     * appended after whatever already happened that day, which is the
     * only ordering a date-only backfill can express. Compares whole
     * calendar days (`whereDate`), not raw datetimes: since #1963 every
     * row — backfilled, edited or written live by `AthleteObserver` — is
     * stored at midnight of the owner's day and ordered by id, but rows
     * written before it carry the time of day they were saved, and a live
     * one from later that day must still share its day with a backfill,
     * not compare as "after" it.
     */
    private function neighbour(Athlete $athlete, string $kind, CarbonInterface $recordedAt, bool $earlier, ?int $editing = null): ?AthletePromotion
    {
        // `Athlete::promotions()` bakes in its own `recorded_at DESC, id
        // DESC` default order for the read-timeline use case. `orderBy()`
        // APPENDS rather than replaces an existing order, so without
        // `reorder()` first, the "later" branch's ascending order below
        // would never actually take effect — id is unique, so the
        // inherited DESC pair alone would always decide the row, handing
        // back the FARTHEST future row instead of the nearest one.
        $query = $athlete->promotions()->reorder()->where('kind', $kind)
            ->when($editing !== null, static fn ($q) => $q->whereKeyNot($editing));
        $day = $recordedAt->toDateString();

        return $earlier
            ? $query->whereDate('recorded_at', '<=', $day)->orderByDesc('recorded_at')->orderByDesc('id')->first()
            : $query->whereDate('recorded_at', '>', $day)->orderBy('recorded_at')->orderBy('id')->first();
    }
}
