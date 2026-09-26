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
 * **Never a guess.** An interval the ladder cannot walk — a belt that went
 * backwards, rows that contradict each other, a kids' grade an adult's ladder
 * never passes — reports nothing. So does a walk that would step into a belt
 * the history already has a row for, or has already been offered: a belt is
 * reached once, and a second row for it is the one thing a ghost must never
 * lead to.
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
 * **A window, or nothing.** A step goes after the row the walk left from and
 * no later than the next row after it (today, when there is none), never
 * counting the stripe reset a live promotion writes beside its belt row, nor
 * the starting row a step completes. A step with no day left in its window —
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
        $sorted = $this->chronological($records);
        if ($sorted === []) {
            return ['gaps' => [], 'history_starts_at' => null];
        }

        $this->rows = array_values(array_filter($sorted, static fn (PromotionRecord $row): bool => ! $row->isReset()));
        $found = $this->rows === [] ? [] : $this->replay($currentBelt, $currentStripes);

        return [
            'gaps' => $this->gaps($found, $skipped),
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
        if ($here === null || $there === null || $here >= $there) {
            // Already on it or past it: the walk to an earlier row stepped in.
            return [[], $state, $enteredOn];
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
     * Oldest first. Rows sharing a moment — a day's backfill, all stored at
     * midnight — go in the order the ladder climbs, not the order they were
     * typed: two stripes transcribed newest first are still one then two.
     *
     * @param list<PromotionRecord> $records
     *
     * @return list<PromotionRecord>
     */
    private function chronological(array $records): array
    {
        usort($records, fn (PromotionRecord $a, PromotionRecord $b): int => [
            $a->recordedAt->getTimestamp(),
            $this->ladder->climbPosition($a->belt()) ?? PHP_INT_MAX,
            $a->stripes(),
            $a->id,
        ] <=> [
            $b->recordedAt->getTimestamp(),
            $this->ladder->climbPosition($b->belt()) ?? PHP_INT_MAX,
            $b->stripes(),
            $b->id,
        ]);

        return $records;
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

            $before = $this->rowAfter($after, $completes);
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
            ];
        }

        return $gaps;
    }

    /**
     * The first row after this one (resets are already out), passing over
     * the starting row a step completes: a step cannot be bounded by the row
     * it moves.
     */
    private function rowAfter(PromotionRecord $row, ?PromotionRecord $completes): ?PromotionRecord
    {
        $position = array_search($row, $this->rows, true);
        if (! \is_int($position)) {
            return null;
        }

        foreach (\array_slice($this->rows, $position + 1) as $next) {
            if ($next !== $completes) {
                return $next;
            }
        }

        return null;
    }

    /** @return Neighbour|null */
    private static function neighbour(?PromotionRecord $row): ?array
    {
        return $row === null ? null : ['promotion_id' => $row->id, 'recorded_at' => $row->day()];
    }
}
