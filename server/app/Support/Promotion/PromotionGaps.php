<?php

declare(strict_types=1);

namespace App\Support\Promotion;

use App\Enums\Belt;
use App\Support\MartialArt\RankLadder;
use Carbon\CarbonImmutable;

/**
 * The steps an athlete's promotion history is missing (#1966).
 *
 * The rows are replayed oldest first, and the academy's ladder is walked from
 * where one row leaves the athlete to where the next one **starts** — with
 * the same {@see RankLadder::nextStep()} "Chi promuovere?" uses (#1841).
 * Every step on that walk is a step nobody wrote down; the row itself covers
 * however many steps it jumps (a stripe row 1 → 3, a judo double promotion).
 * From the last row, the walk goes to the belt and stripes the athlete holds
 * today.
 *
 * Where a row starts:
 * - a stripe row, on its belt at its `from_stripes`;
 * - a belt row, on its `from_belt` once the ladder's next step leaves it;
 * - a starting row (#1771) that is not the first, just before the belt step
 *   into its belt — the one step it stands for, reported to be **completed**
 *   (`completes_promotion_id`) rather than added as a second row.
 *
 * **Never a guess.** An interval the ladder cannot walk — rows that
 * contradict each other, a kids' grade an adult's ladder never passes —
 * reports nothing. So does a walk that would step into a belt the history
 * already has a row for, or has already been offered: a belt is reached
 * once, and a second row for it is the one thing a ghost must never lead to.
 *
 * **Corrections are not promotions.** A belt set by mistake and set back
 * cancels out — the shortest round trip b1 → b2, b2 → b1 between two
 * consecutive belt rows, with nothing recorded on b2 in between: the athlete
 * never left b1, so neither row is replayed, and b2 is not reached. A belt
 * row that goes down with nothing undoing it is a contradiction: nothing is
 * missing before it, and the count on the belt it returns to is held.
 *
 * Known limits, left on purpose: a double mistake (blue → purple → brown,
 * then brown → blue) is no round trip, so the steps up to purple stay on
 * offer; and nested corrections cancel from the inside out only on distinct
 * days — made at the same midnight, the outer undo sorts between the inner
 * pair and nothing cancels. Neither offers a row twice.
 *
 * **Held until the belt is dated.** Once a walk takes a starting row's belt
 * step, nothing after it on that walk is offered: those steps come after a
 * promotion whose day is not known yet, and would have no honest window. They
 * appear once the starting row is completed, because then it is an ordinary
 * belt row with a date.
 *
 * **Nothing before the record.** Nothing is reported before the first row,
 * and the stripes on the belt of a starting row are taken as held on arrival,
 * as the row records the belt and not the count — whether it opens the
 * history or was imported after older rows were transcribed.
 *
 * **One exception: a starting row that opens the history (#1974)** — the
 * most common imported athlete, entered on a belt with nothing typed in
 * before it. Its date is the day of entry and its belt step is still the one
 * thing missing, but no row says which belt the athlete came from: the step
 * is offered with the belts the ladder allows before it
 * (`from_belt_options`, one suggested), no lower bound, and the row's own day
 * as the latest. Not for the ladder's first belt — nobody comes before white
 * — and not for a starting row the history sets back (a belt entered by
 * mistake).
 *
 * **A window, or nothing.** A step goes after the row the walk left from and
 * no later than the next row after it (today, when there is none), never
 * counting the stripe reset a live promotion writes beside its belt row. A
 * step that completes a starting row goes no later than that row's own day
 * either: the athlete held the belt when entered. A step with no day left in its window —
 * two rows on the same day with steps between them, jumped in one save, or a
 * row dated today with steps still after it — is not offered: it could never
 * be filled.
 *
 * Pure: rows, ladder and eligibility in, gaps out.
 *
 * @phpstan-type Neighbour array{promotion_id: int, recorded_at: string}
 * @phpstan-type Gap array{
 *     key: string,
 *     kind: 'belt'|'stripe',
 *     belt: string,
 *     from_belt: string|null,
 *     from_stripes: int|null,
 *     to_stripes: int|null,
 *     after: Neighbour|null,
 *     before: Neighbour|null,
 *     completes_promotion_id: int|null,
 *     from_belt_options: list<string>|null,
 * }
 * @phpstan-type Step array{kind: 'belt'|'stripe', belt: Belt, stripes: int, from_belt: Belt, from_stripes: int}
 * @phpstan-type State array{belt: Belt, stripes: int}
 * @phpstan-type Next array{kind: 'belt'|'stripe', belt: Belt, stripes: int}|null
 * @phpstan-type Target array{type: 'state'|'leaving'|'entering', belt: Belt, stripes: int}
 * @phpstan-type Found array{step: Step, after: PromotionRecord, completes: PromotionRecord|null}
 */
final class PromotionGaps
{
    /** More steps than any ladder climbs end to end: a walk this long went wrong. */
    private const MAX_STEPS = 80;

    /** @var list<PromotionRecord> */
    private array $rows = [];

    /** @var array<string, PromotionRecord> starting rows after the first, by belt */
    private array $placeholders = [];

    /** @var array<string, true> belts reached by a row, or already offered */
    private array $reached = [];

    /**
     * @param \Closure(Belt, CarbonImmutable): bool $kidsEligible whether the kids'
     *                                                             grades were the
     *                                                             athlete's to climb,
     *                                                             on that belt, that day
     */
    public function __construct(
        private readonly RankLadder $ladder,
        private readonly \Closure $kidsEligible,
        private readonly CarbonImmutable $today,
    ) {
    }

    /**
     * @param list<PromotionRecord> $records in any order
     * @param list<string>          $skipped the states the owner said were never reached, as `belt:stripes`
     *
     * @return array{gaps: list<Gap>, history_starts_at: string|null}
     */
    public function find(array $records, Belt $currentBelt, int $currentStripes, array $skipped): array
    {
        $sorted = new PromotionOrder($this->ladder)->chronological($records);
        if ($sorted === []) {
            return ['gaps' => [], 'history_starts_at' => null];
        }

        $this->rows = $this->withoutUndone(array_values(array_filter($sorted, static fn (PromotionRecord $row): bool => ! $row->isReset())));
        $found = $this->rows === [] ? [] : $this->replay($currentBelt, $currentStripes);
        $gaps = $this->gaps($found, $skipped);
        $opening = $this->openingStep($currentBelt);

        return [
            // Oldest first: the step before the first row leads.
            'gaps' => $opening === null ? $gaps : [$opening, ...$gaps],
            'history_starts_at' => $sorted[0]->day(),
        ];
    }

    /**
     * Whether a row to be written is exactly one of these gaps, dated inside
     * its window: after the row before it, and not after the row after it
     * (today, when there is none). Such a row is consistent by construction.
     *
     * @param list<Gap>            $gaps
     * @param array<string, mixed> $fields `kind`, and `belt_at_event` / `from_stripes` /
     *                                     `to_stripes` or `from_belt` / `to_belt`;
     *                                     `completes` when a starting row is being completed
     */
    public static function admits(array $gaps, array $fields, string $date, CarbonImmutable $today): bool
    {
        foreach ($gaps as $gap) {
            if (self::fills($gap, $fields) && self::inWindow($gap, $date, $today)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Whether a date falls in a gap's window: after its `after`, and not
     * after its `before` (today, when there is none).
     *
     * @param Gap $gap
     */
    public static function inWindow(array $gap, string $date, CarbonImmutable $today): bool
    {
        $after = $gap['after']['recorded_at'] ?? null;
        $before = $gap['before']['recorded_at'] ?? $today->toDateString();

        return ($after === null || $date > $after) && $date <= $before;
    }

    /**
     * @param Gap                  $gap
     * @param array<string, mixed> $fields
     */
    private static function fills(array $gap, array $fields): bool
    {
        $completes = $fields['completes'] ?? null;
        if ($gap['completes_promotion_id'] !== (is_numeric($completes) ? (int) $completes : null)
            || ($fields['kind'] ?? null) !== $gap['kind']) {
            return false;
        }

        if ($gap['kind'] === 'belt') {
            return ($fields['from_belt'] ?? null) === $gap['from_belt']
                && ($fields['to_belt'] ?? null) === $gap['belt'];
        }

        $from = $fields['from_stripes'] ?? null;
        $to = $fields['to_stripes'] ?? null;

        return ($fields['belt_at_event'] ?? null) === $gap['belt']
            && is_numeric($from) && (int) $from === $gap['from_stripes']
            && is_numeric($to) && (int) $to === $gap['to_stripes'];
    }

    /**
     * @return list<Found>
     */
    private function replay(Belt $currentBelt, int $currentStripes): array
    {
        $first = $this->rows[0];
        $this->placeholders = [];
        $this->reached = [];
        foreach ($this->rows as $row) {
            if ($row->kind !== 'belt') {
                continue;
            }
            if ($row !== $first && $row->isOpening()) {
                $this->placeholders[$row->belt()->value] ??= $row;
            } else {
                $this->reached[$row->belt()->value] = true;
            }
        }

        $state = ['belt' => $first->belt(), 'stripes' => $first->stripes()];
        $enteredOn = $first->isOpening() ? $first->belt() : null;
        $anchor = $first;
        $found = [];

        foreach (\array_slice($this->rows, 1) as $row) {
            [$more, $state, $enteredOn] = $this->through($row, $state, $enteredOn, $anchor);
            $found = [...$found, ...$more];
            $anchor = $row;
        }

        $target = ['type' => 'state', 'belt' => $currentBelt, 'stripes' => $currentStripes];
        $tail = $this->walk($state, $enteredOn, $target, $this->today);
        if ($tail !== null) {
            $found = [...$found, ...$this->offered($tail['steps'], $anchor)];
        }

        return $found;
    }

    /**
     * The rows without the belt mistakes that were set back. A correction is
     * the shortest round trip: a belt row b1 → b2 and the very next belt row,
     * b2 → b1, with nothing recorded on b2 between them — a stripe there means
     * the athlete really held it. Such a pair cancels: the athlete never left
     * b1, so neither row is a step, a boundary, or a belt reached, and the
     * stripe rows around them still count on b1.
     *
     * Where two pairs share a row — a real promotion into blue years ago, a
     * demotion by mistake, and the promotion that undid it the next day — the
     * shorter one is the correction, and the real promotion stays. Pairs are
     * taken shortest first, so nested ones cancel from the inside out.
     *
     * @param list<PromotionRecord> $rows
     *
     * @return list<PromotionRecord>
     */
    private function withoutUndone(array $rows): array
    {
        while (($pair = $this->shortestRoundTrip($rows)) !== null) {
            unset($rows[$pair[0]], $rows[$pair[1]]);
            $rows = array_values($rows);
        }

        return $rows;
    }

    /**
     * @param list<PromotionRecord> $rows
     *
     * @return array{int, int}|null the positions of the correction pair to cancel next
     */
    private function shortestRoundTrip(array $rows): ?array
    {
        $belts = array_keys(array_filter($rows, static fn (PromotionRecord $row): bool => $row->kind === 'belt'));
        $shortest = null;
        $span = PHP_INT_MAX;
        foreach (\array_slice($belts, 1) as $index => $later) {
            $earlier = $belts[$index];
            if (! PromotionOrder::undoEachOther($rows[$later], $rows[$earlier]) || self::held($rows, $earlier, $later)) {
                continue;
            }

            $length = $rows[$later]->recordedAt->getTimestamp() - $rows[$earlier]->recordedAt->getTimestamp();
            if ($length < $span) {
                $shortest = [$earlier, $later];
                $span = $length;
            }
        }

        return $shortest;
    }

    /**
     * Whether anything was recorded on the belt the earlier row went to,
     * between the two: then it was held, not a slip.
     *
     * @param list<PromotionRecord> $rows
     */
    private static function held(array $rows, int $earlier, int $later): bool
    {
        foreach (\array_slice($rows, $earlier + 1, $later - $earlier - 1) as $between) {
            if ($between->kind === 'stripe' && $between->beltAtEvent === $rows[$earlier]->toBelt) {
                return true;
            }
        }

        return false;
    }

    /**
     * The steps missing before one row, and where it leaves the athlete.
     *
     * @param State $state
     *
     * @return array{0: list<Found>, 1: State, 2: Belt|null}
     */
    private function through(PromotionRecord $row, array $state, ?Belt $enteredOn, PromotionRecord $anchor): array
    {
        if ($row->isOpening()) {
            return $this->arrival($row, $state, $enteredOn, $anchor);
        }

        if ($row->kind === 'belt' && $this->wentDown($row)) {
            // A correction, not a promotion: nothing is missing before it,
            // and the count on the belt it returns to is the one held there.
            return [[], ['belt' => $row->belt(), 'stripes' => $state['stripes']], $row->belt()];
        }

        $target = $row->kind === 'stripe'
            ? ['type' => 'state', 'belt' => $row->beltAtEvent, 'stripes' => $row->fromStripes ?? 0]
            : ['type' => 'leaving', 'belt' => $row->fromBelt ?? $row->belt(), 'stripes' => 0];
        $walk = $this->walk($state, $enteredOn, $target, $row->recordedAt);
        $found = $walk === null ? [] : $this->offered($walk['steps'], $anchor);

        if ($row->kind === 'stripe') {
            return [$found, ['belt' => $row->beltAtEvent, 'stripes' => $row->toStripes ?? 0], null];
        }

        // A poom that becomes a dan carries its number (#1841): read it off the
        // ladder when the row takes the ladder's own step.
        $next = $walk === null ? null : $this->next($walk['at'], $row->recordedAt);
        $stripes = $next !== null && $next['kind'] === 'belt' && $next['belt'] === $row->belt() ? $next['stripes'] : 0;

        return [$found, ['belt' => $row->belt(), 'stripes' => $stripes], null];
    }

    /** A belt row whose belt sits below the one it left, in the order people climb. */
    private function wentDown(PromotionRecord $row): bool
    {
        $from = $row->fromBelt === null ? null : $this->ladder->climbPosition($row->fromBelt);
        $to = $this->ladder->climbPosition($row->belt());

        return $from !== null && $to !== null && $to < $from;
    }

    /**
     * A starting row after the first: the athlete arrived on its belt. Its
     * belt step is offered to be completed, the steps before it as usual; the
     * stripes on the belt are held on arrival.
     *
     * @param State $state
     *
     * @return array{0: list<Found>, 1: State, 2: Belt|null}
     */
    private function arrival(PromotionRecord $row, array $state, ?Belt $enteredOn, PromotionRecord $anchor): array
    {
        $belt = $row->belt();
        $here = $this->ladder->climbPosition($state['belt']);
        $there = $this->ladder->climbPosition($belt);
        if ($here === null || $there === null || $here > $there) {
            return [[], $state, $enteredOn];
        }
        if ($here === $there) {
            // Already on it: a row typed in before this one stepped in. The
            // stripes on it are still the ones held on arrival.
            return [[], $state, $belt];
        }

        $walk = $this->walk($state, $enteredOn, ['type' => 'entering', 'belt' => $belt, 'stripes' => 0], $row->recordedAt);
        $next = $walk === null ? null : $this->next($walk['at'], $row->recordedAt);
        if ($walk === null || $next === null) {
            return [[], ['belt' => $belt, 'stripes' => 0], $belt];
        }

        $step = [...$next, 'from_belt' => $walk['at']['belt'], 'from_stripes' => $walk['at']['stripes']];

        return [$this->offered([...$walk['steps'], $step], $anchor), ['belt' => $belt, 'stripes' => $next['stripes']], $belt];
    }

    /**
     * The steps from one state to a target, and the state it stops at; null
     * when the ladder does not get there. `$enteredOn` is the belt of a
     * starting row whose count is not known: the steps on that belt are held
     * on arrival.
     *
     * @param State  $from
     * @param Target $target
     *
     * @return array{steps: list<Step>, at: State}|null
     */
    private function walk(array $from, ?Belt $enteredOn, array $target, CarbonImmutable $on): ?array
    {
        if ($enteredOn !== null) {
            if ($target['type'] === 'state' && $target['belt'] === $enteredOn) {
                return ['steps' => [], 'at' => ['belt' => $enteredOn, 'stripes' => $target['stripes']]];
            }
            $from = $this->leaving($enteredOn, $on);
        }

        $state = $from;
        $steps = [];
        for ($i = 0; $i <= self::MAX_STEPS; $i++) {
            $next = $this->next($state, $on);
            if ($this->arrived($target, $state, $next)) {
                return ['steps' => $steps, 'at' => $state];
            }
            if ($next === null || $this->passed($target, $state)) {
                return null;
            }

            $steps[] = [...$next, 'from_belt' => $state['belt'], 'from_stripes' => $state['stripes']];
            $state = ['belt' => $next['belt'], 'stripes' => $next['stripes']];
        }

        return null;
    }

    /**
     * @param Target $target
     * @param State  $state
     * @param Next   $next
     */
    private function arrived(array $target, array $state, ?array $next): bool
    {
        return match ($target['type']) {
            'state' => $state['belt'] === $target['belt'] && $state['stripes'] === $target['stripes'],
            'leaving' => $state['belt'] === $target['belt'] && ($next === null || $next['kind'] === 'belt'),
            'entering' => $next !== null && $next['kind'] === 'belt' && $next['belt'] === $target['belt'],
        };
    }

    /**
     * Whether the walk has gone past its target, and so will never reach it.
     *
     * @param Target $target
     * @param State  $state
     */
    private function passed(array $target, array $state): bool
    {
        $here = $this->ladder->climbPosition($state['belt']);
        $there = $this->ladder->climbPosition($target['belt']);
        if ($here === null || $there === null) {
            return true;
        }

        return match ($target['type']) {
            'state' => $here > $there || ($here === $there && $state['stripes'] > $target['stripes']),
            'leaving' => $here > $there,
            'entering' => $here >= $there,
        };
    }

    /**
     * Where the ladder leaves a belt whose count is not known: the stripes on
     * it are passed over, unrecorded.
     *
     * @return State
     */
    private function leaving(Belt $belt, CarbonImmutable $on): array
    {
        $state = ['belt' => $belt, 'stripes' => 0];
        for ($i = 0; $i < self::MAX_STEPS; $i++) {
            $next = $this->next($state, $on);
            if ($next === null || $next['kind'] === 'belt') {
                break;
            }
            $state = ['belt' => $next['belt'], 'stripes' => $next['stripes']];
        }

        return $state;
    }

    /**
     * @param State $state
     *
     * @return Next
     */
    private function next(array $state, CarbonImmutable $on): ?array
    {
        return $this->ladder->nextStep($state['belt'], $state['stripes'], ($this->kidsEligible)($state['belt'], $on));
    }

    /**
     * The steps of one walk the page may offer: all of them, or none if one
     * would lead into a belt the history already has (a contradiction, never
     * a guess); and nothing after a starting row's belt step, whose day is not
     * known yet.
     *
     * @param list<Step> $steps
     *
     * @return list<Found>
     */
    private function offered(array $steps, PromotionRecord $after): array
    {
        $found = [];
        $reached = [];
        foreach ($steps as $step) {
            if ($step['kind'] !== 'belt') {
                $found[] = ['step' => $step, 'after' => $after, 'completes' => null];

                continue;
            }

            $belt = $step['belt']->value;
            if (isset($this->reached[$belt]) || isset($reached[$belt])) {
                return [];
            }

            $reached[$belt] = true;
            $completes = $this->placeholders[$belt] ?? null;
            $found[] = ['step' => $step, 'after' => $after, 'completes' => $completes];
            if ($completes !== null) {
                break;
            }
        }

        $this->reached = [...$this->reached, ...$reached];

        return $found;
    }

    /**
     * @param list<Found>  $found
     * @param list<string> $skipped
     *
     * @return list<Gap>
     */
    private function gaps(array $found, array $skipped): array
    {
        $gaps = [];
        foreach ($found as ['step' => $step, 'after' => $after, 'completes' => $completes]) {
            // A starting row is completed, not skipped: it is a belt they hold.
            if ($completes === null && \in_array("{$step['belt']->value}:{$step['stripes']}", $skipped, true)) {
                continue;
            }

            $before = $this->bound($after, $completes);
            if (($before?->day() ?? $this->today->toDateString()) <= $after->day()) {
                continue;
            }

            $gaps[] = [
                'key' => "{$step['kind']}:{$step['belt']->value}:{$step['stripes']}",
                'kind' => $step['kind'],
                'belt' => $step['belt']->value,
                'from_belt' => $step['kind'] === 'belt' ? $step['from_belt']->value : null,
                'from_stripes' => $step['kind'] === 'stripe' ? $step['from_stripes'] : null,
                'to_stripes' => $step['kind'] === 'stripe' ? $step['stripes'] : null,
                'after' => self::neighbour($after),
                'before' => self::neighbour($before),
                'completes_promotion_id' => $completes?->id,
                // A known row before it says which belt: nothing to choose.
                'from_belt_options' => null,
            ];
        }

        return $gaps;
    }

    /**
     * The belt step a starting row stands for when it opens the history
     * (#1974). Nothing before it says which belt the athlete came from, so
     * the owner chooses among the belts the ladder allows before it; the one
     * whose next step leads into it is suggested.
     *
     * @return Gap|null
     */
    private function openingStep(Belt $currentBelt): ?array
    {
        $first = $this->rows[0] ?? null;
        if ($first === null || ! $first->isOpening() || $this->setBack($first, $currentBelt)) {
            return null;
        }

        $belt = $first->belt();
        $options = $this->beltsBefore($belt, $first->recordedAt);
        if ($options === []) {
            return null;
        }

        [$suggested, $stripes] = $this->steppingInto($belt, $options, $first->recordedAt);

        return [
            'key' => "belt:{$belt->value}:{$stripes}",
            'kind' => 'belt',
            'belt' => $belt->value,
            'from_belt' => $suggested->value,
            'from_stripes' => null,
            'to_stripes' => null,
            // Nothing is known before it.
            'after' => null,
            // They held the belt the day they were entered.
            'before' => self::neighbour($first),
            'completes_promotion_id' => $first->id,
            'from_belt_options' => array_map(static fn (Belt $option): string => $option->value, $options),
        ];
    }

    /**
     * Whether the history puts the athlete below the starting row's belt
     * afterwards — a belt entered by mistake and corrected, a row recorded on
     * a lower belt, or an athlete below it today: then the history contradicts
     * it, and a guess at the day they reached it would be worse than none.
     */
    private function setBack(PromotionRecord $first, Belt $currentBelt): bool
    {
        $held = $this->ladder->climbPosition($first->belt());
        if ($held === null) {
            return true;
        }

        $below = fn (Belt $belt): bool => ($this->ladder->climbPosition($belt) ?? $held) < $held;
        if ($below($currentBelt)) {
            return true;
        }

        foreach (\array_slice($this->rows, 1) as $row) {
            if ($below($row->belt())) {
                return true;
            }
        }

        return false;
    }

    /**
     * The belts an athlete can hold before this one, in the order people
     * climb them: the kids' grades only when they were the athlete's to climb.
     *
     * @return list<Belt>
     */
    private function beltsBefore(Belt $belt, CarbonImmutable $on): array
    {
        $there = $this->ladder->climbPosition($belt);
        if ($there === null) {
            return [];
        }

        $before = array_values(array_filter(
            $this->ladder->belts(),
            fn (Belt $candidate): bool => ($this->ladder->climbPosition($candidate) ?? $there) < $there
                && (! $this->ladder->isKidsGrade($candidate) || ($this->kidsEligible)($candidate, $on)),
        ));
        usort($before, fn (Belt $a, Belt $b): int => $this->ladder->climbPosition($a) <=> $this->ladder->climbPosition($b));

        return $before;
    }

    /**
     * Of the belts before this one, the highest whose next belt step leads
     * into it — the one to suggest — and the count that step lands on (a
     * poom's number carried into the dan). The highest of them when none does.
     *
     * @param non-empty-list<Belt> $options
     *
     * @return array{Belt, int}
     */
    private function steppingInto(Belt $belt, array $options, CarbonImmutable $on): array
    {
        foreach (array_reverse($options) as $candidate) {
            $next = $this->next($this->leaving($candidate, $on), $on);
            if ($next !== null && $next['kind'] === 'belt' && $next['belt'] === $belt) {
                return [$candidate, $next['stripes']];
            }
        }

        return [$options[\count($options) - 1], 0];
    }

    /**
     * The row a step must come no later than: the first row after the one it
     * follows (resets are already out). For a step that completes a starting
     * row, that is the earlier of the next row and the starting row itself —
     * the athlete held the belt the day they were entered, so the promotion
     * was that day at the latest. A starting row that comes before the row
     * the step follows leaves it no day at all.
     */
    private function bound(PromotionRecord $after, ?PromotionRecord $completes): ?PromotionRecord
    {
        $position = array_search($after, $this->rows, true);
        if (! \is_int($position)) {
            return null;
        }

        if ($completes !== null && array_search($completes, $this->rows, true) < $position) {
            return $completes;
        }

        return $this->rows[$position + 1] ?? null;
    }

    /** @return Neighbour|null */
    private static function neighbour(?PromotionRecord $row): ?array
    {
        return $row === null ? null : ['promotion_id' => $row->id, 'recorded_at' => $row->day()];
    }
}
