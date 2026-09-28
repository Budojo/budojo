<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Actions\Promotion\GetPromotionGapsAction;
use App\Enums\Belt;
use App\Models\Athlete;
use App\Models\AthletePromotion;
use App\Support\OperatorDay;
use App\Support\Promotion\PromotionGaps;
use Carbon\CarbonInterface;
use Illuminate\Contracts\Validation\Validator;

/**
 * Cross-field rule for backfilling promotion history (#1431 PR 2 of 2).
 *
 * **A row is saved as typed (#1991).** #1431 refused any backfill that did
 * not meet its neighbours exactly. That forced a paper register to be typed
 * in order, and a gap is no contradiction: the ghost rows (#1966) exist to
 * fill it. So a row that leaves a gap saves — «Bianca 1 → 2» in March, under
 * a row of November that starts at 3.
 *
 * **Only going backwards warns.** A row that has the athlete go back next to
 * a row already recorded is a contradiction:
 * - a stripe count below the one held before it, or above the one the next
 *   row starts from, on the same belt;
 * - a belt below the one held before it, or above the one the next row
 *   starts from — for a belt row, and for the belt a stripe row is on,
 *   against the stripe and the belt rows around it.
 *
 * It is a 422 naming the row, in the owner's language, and the owner still
 * decides: the store request answers it as `chain_conflict`, and
 * `confirm_conflict` saves it anyway. The gap finder walks no interval that
 * goes backwards, so an accepted contradiction offers nothing in between.
 *
 * Belts compare in the order the academy's ladder climbs them. A belt the
 * ladder does not place is never a contradiction: never a guess.
 *
 * A later belt row with no `from_belt` is a starting point (#1771): it says
 * which belt was held that day and nothing about how, so it constrains
 * nothing before it. A stripe row that raises nothing (a reset) is no step,
 * as for the gap finder, and constrains nothing either.
 *
 * **A row that fills a gap exactly is consistent by construction (#1966).**
 * The gaps are the steps the ladder walks through between the rows that
 * exist, so one of them, dated inside its window, is never checked.
 *
 * @phpstan-import-type Gap from PromotionGaps
 *
 * @phpstan-type Conflict array{field: string, promotion_id: int, recorded_at: string, belt: string, stripes: int|null}
 */
trait ValidatesPromotionChainConsistency
{
    use SpeaksTheOwnersLanguage;

    /** @var list<Conflict> the rows this one would contradict (#1991) */
    private array $chainConflicts = [];

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

        // The owner has read the warning and saves the row as typed (#1991).
        if ($this->boolean('confirm_conflict')) {
            return;
        }

        $fields = $this->only(['kind', 'from_belt', 'to_belt', 'from_stripes', 'to_stripes', 'belt_at_event']);
        if ($this->fillsAGap($athlete, $fields, $recordedAt)) {
            return;
        }

        $kind === 'belt'
            ? $this->validateBeltChain($validator, $athlete, $recordedAt, $this->input('from_belt'), $this->input('to_belt'))
            : $this->validateStripeChain($validator, $athlete, $recordedAt);
    }

    /** @return list<Conflict> */
    protected function chainConflicts(): array
    {
        return $this->chainConflicts;
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
        $from = \is_string($fromBelt) ? Belt::tryFrom($fromBelt) : null;
        $to = \is_string($toBelt) ? Belt::tryFrom($toBelt) : null;
        if ($to === null) {
            return; // the shape rules already failed
        }

        // A first belt says only what was held that day: that is where it starts.
        $previous = $this->neighbour($athlete, 'belt', $recordedAt, earlier: true, editing: $editing);
        if ($previous?->to_belt !== null && $this->below($from ?? $to, $previous->to_belt)) {
            $this->beltConflict($validator, $from === null ? 'to_belt' : 'from_belt', $previous, $previous->to_belt, 'chain.belt_before');
        }

        $next = $this->neighbour($athlete, 'belt', $recordedAt, earlier: false, editing: $editing);
        if ($next?->from_belt !== null && $this->below($next->from_belt, $to)) {
            $this->beltConflict($validator, 'to_belt', $next, $next->from_belt, 'chain.belt_after');
        }
    }

    private function validateStripeChain(Validator $validator, Athlete $athlete, CarbonInterface $recordedAt): void
    {
        // `is_numeric` narrows `mixed` before the cast (PHPStan level 9); a
        // value that fails the shape rules never reaches this check.
        $beltRaw = $this->input('belt_at_event');
        $belt = \is_string($beltRaw) ? Belt::tryFrom($beltRaw) : null;
        $fromRaw = $this->input('from_stripes');
        $toRaw = $this->input('to_stripes');
        if ($belt === null || ! is_numeric($fromRaw) || ! is_numeric($toRaw)) {
            return;
        }

        $this->validateStripesAgainstStripes($validator, $athlete, $recordedAt, $belt, (int) $fromRaw, (int) $toRaw);
        $this->validateStripesAgainstBelts($validator, $athlete, $recordedAt, $belt);
    }

    private function validateStripesAgainstStripes(Validator $validator, Athlete $athlete, CarbonInterface $recordedAt, Belt $belt, int $from, int $to): void
    {
        $previous = $this->neighbour($athlete, 'stripe', $recordedAt, earlier: true);
        if ($previous !== null) {
            $held = $previous->to_stripes ?? 0;
            if ($previous->belt_at_event === $belt && $from < $held) {
                $to <= $held
                    ? $this->stripeConflict($validator, 'to_stripes', $previous, $held, 'chain.stripes_before_to', ['to' => (string) $to])
                    : $this->stripeConflict($validator, 'from_stripes', $previous, $held, 'chain.stripes_before_from', ['from' => (string) $from]);
            } elseif ($this->below($belt, $previous->belt_at_event)) {
                $this->beltConflict($validator, 'belt_at_event', $previous, $previous->belt_at_event, 'chain.belt_before');
            }
        }

        $next = $this->neighbour($athlete, 'stripe', $recordedAt, earlier: false);
        if ($next !== null) {
            $held = $next->from_stripes ?? 0;
            if ($next->belt_at_event === $belt && $to > $held) {
                $this->stripeConflict($validator, 'to_stripes', $next, $held, 'chain.stripes_after', ['to' => (string) $to]);
            } elseif ($this->below($next->belt_at_event, $belt)) {
                $this->beltConflict($validator, 'belt_at_event', $next, $next->belt_at_event, 'chain.belt_after');
            }
        }
    }

    /** The belt a stripe is on, against the belt the belt rows say was held then. */
    private function validateStripesAgainstBelts(Validator $validator, Athlete $athlete, CarbonInterface $recordedAt, Belt $belt): void
    {
        $previous = $this->neighbour($athlete, 'belt', $recordedAt, earlier: true);
        if ($previous?->to_belt !== null && $this->below($belt, $previous->to_belt)) {
            $this->beltConflict($validator, 'belt_at_event', $previous, $previous->to_belt, 'chain.belt_before');
        }

        $next = $this->neighbour($athlete, 'belt', $recordedAt, earlier: false);
        if ($next?->from_belt !== null && $this->below($next->from_belt, $belt)) {
            $this->beltConflict($validator, 'belt_at_event', $next, $next->from_belt, 'chain.belt_after');
        }
    }

    /** Whether one belt comes before another on the academy's ladder; never for a belt it does not place. */
    private function below(Belt $belt, Belt $than): bool
    {
        $ladder = $this->rankLadder();
        $here = $ladder->climbPosition($belt);
        $there = $ladder->climbPosition($than);

        return $here !== null && $there !== null && $here < $there;
    }

    /**
     * @param array<string, string> $replace
     */
    private function stripeConflict(Validator $validator, string $field, AthletePromotion $row, int $held, string $key, array $replace): void
    {
        $message = $this->promotionChoice($key, $held, [
            'date' => $this->ownerDate($row->recorded_at),
            'held' => (string) $held,
            ...$replace,
        ]);
        $this->conflict($validator, $message, [
            'field' => $field,
            'promotion_id' => $row->id,
            'recorded_at' => $row->recorded_at->toDateString(),
            'belt' => $row->belt_at_event->value,
            'stripes' => $held,
        ]);
    }

    private function beltConflict(Validator $validator, string $field, AthletePromotion $row, Belt $belt, string $key): void
    {
        $this->conflict($validator, $this->promotionLine($key, ['date' => $this->ownerDate($row->recorded_at)]), [
            'field' => $field,
            'promotion_id' => $row->id,
            'recorded_at' => $row->recorded_at->toDateString(),
            'belt' => $belt->value,
            'stripes' => null,
        ]);
    }

    /**
     * One warning per field: the nearest row it contradicts says enough.
     *
     * @param Conflict $conflict
     */
    private function conflict(Validator $validator, string $message, array $conflict): void
    {
        if (\in_array($conflict['field'], array_column($this->chainConflicts, 'field'), true)) {
            return;
        }

        $this->chainConflicts[] = $conflict;
        $validator->errors()->add($conflict['field'], $message);
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
     *
     * A stripe row that raises nothing — the reset a live promotion writes
     * beside its belt row — is no step, and is never a neighbour.
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
            ->when($kind === 'stripe', static fn ($q) => $q->whereColumn('to_stripes', '>', 'from_stripes'))
            ->when($editing !== null, static fn ($q) => $q->whereKeyNot($editing));
        $day = $recordedAt->toDateString();

        return $earlier
            ? $query->whereDate('recorded_at', '<=', $day)->orderByDesc('recorded_at')->orderByDesc('id')->first()
            : $query->whereDate('recorded_at', '>', $day)->orderBy('recorded_at')->orderBy('id')->first();
    }
}
