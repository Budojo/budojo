<?php

declare(strict_types=1);

namespace App\Support\Promotion;

use App\Enums\Belt;
use App\Support\MartialArt\RankLadder;
use Carbon\CarbonImmutable;

/**
 * The steps an athlete's promotion history is missing (#1966).
 *
 * The rows are replayed oldest first, tracking the belt and count each one
 * leaves the athlete on, and the academy's ladder is walked from one state to
 * the next with the same {@see RankLadder::nextStep()} "Chi promuovere?" uses
 * (#1841). Every step the walk passes through before reaching the next row is
 * a step nobody wrote down; from the last row to the belt and stripes the
 * athlete holds today, every step is.
 *
 * **Never a guess.** An interval the ladder cannot walk — a belt that went
 * backwards, rows that contradict each other, a kids' grade an adult's ladder
 * never passes — emits nothing rather than a plausible story.
 *
 * **Nothing before the first row.** What happened before it is history the
 * record does not hold; the page says so in one line. The same goes for the
 * stripes an athlete was entered with: the row that opens a timeline (#1771)
 * records the belt, not the count, so the count on that belt is taken as it
 * comes.
 *
 * **A starting row that is not the first** stands for a promotion whose date
 * is the day the athlete was typed in, not the day it happened: its belt step
 * is reported with `completes_promotion_id`, to be completed, never
 * duplicated.
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
 */
final class PromotionGaps
{
    /** More steps than any ladder climbs end to end: a walk this long went wrong. */
    private const MAX_STEPS = 80;

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
        if ($records === []) {
            return ['gaps' => [], 'history_starts_at' => null];
        }

        $rows = $this->chronological($records);
        $first = $rows[0];
        $placeholders = $this->placeholders($rows);

        $state = ['belt' => $first->belt(), 'stripes' => $first->stripes()];
        $enteredOn = $first->isOpening() ? $first->belt() : null;
        $anchor = $first;
        $steps = [];

        foreach (\array_slice($rows, 1) as $row) {
            if ($row->isReset() || $row->isOpening()) {
                continue;
            }

            $walk = $this->walk($state, $enteredOn, $row->kind, ['belt' => $row->belt(), 'stripes' => $row->stripes()], $row->recordedAt);
            if ($walk !== null) {
                // The last step is this row itself.
                array_pop($walk['steps']);
                $steps = [...$steps, ...$this->anchored($walk['steps'], $anchor)];
            }

            $state = $walk['reached'] ?? ['belt' => $row->belt(), 'stripes' => $row->stripes()];
            $enteredOn = null;
            $anchor = $row;
        }

        $tail = $this->walk($state, $enteredOn, 'tail', ['belt' => $currentBelt, 'stripes' => $currentStripes], $this->today);
        if ($tail !== null) {
            $steps = [...$steps, ...$this->anchored($tail['steps'], $anchor)];
        }

        return [
            'gaps' => $this->gaps($steps, $rows, $placeholders, $skipped),
            'history_starts_at' => $first->day(),
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
            if (! self::fills($gap, $fields)) {
                continue;
            }

            $after = $gap['after']['recorded_at'] ?? null;
            $before = $gap['before']['recorded_at'] ?? $today->toDateString();
            if (($after === null || $date > $after) && $date <= $before) {
                return true;
            }
        }

        return false;
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
     * Starting rows after the first, by the belt they stand for.
     *
     * @param list<PromotionRecord> $rows
     *
     * @return array<string, PromotionRecord>
     */
    private function placeholders(array $rows): array
    {
        $placeholders = [];
        foreach (\array_slice($rows, 1) as $row) {
            if ($row->isOpening()) {
                $placeholders[$row->belt()->value] ??= $row;
            }
        }

        return $placeholders;
    }

    /**
     * The steps from one state to the next, the last of them reaching it;
     * null when the ladder does not get there. `$enteredOn` is the belt an
     * athlete was entered on while the count on it is still unknown: the steps
     * on that belt are history before the record.
     *
     * @param State                  $from
     * @param 'belt'|'stripe'|'tail' $kind a belt row is reached by its belt step; anything else by its state
     * @param State                  $target
     *
     * @return array{steps: list<Step>, reached: State}|null
     */
    private function walk(array $from, ?Belt $enteredOn, string $kind, array $target, CarbonImmutable $on): ?array
    {
        if ($enteredOn !== null) {
            if ($target['belt'] === $enteredOn) {
                return ['steps' => [], 'reached' => $target];
            }
            $from = ['belt' => $enteredOn, 'stripes' => $this->ladder->maxStripes($enteredOn) ?? 0];
        }

        if ($from['belt'] === $target['belt'] && ($kind === 'belt' || $from['stripes'] === $target['stripes'])) {
            return ['steps' => [], 'reached' => $from];
        }

        $steps = [];
        $current = $from;
        for ($i = 0; $i < self::MAX_STEPS; $i++) {
            $next = $this->ladder->nextStep($current['belt'], $current['stripes'], ($this->kidsEligible)($current['belt'], $on));
            if ($next === null) {
                return null;
            }

            $steps[] = [...$next, 'from_belt' => $current['belt'], 'from_stripes' => $current['stripes']];
            $current = ['belt' => $next['belt'], 'stripes' => $next['stripes']];

            $reached = $kind === 'belt'
                ? $next['kind'] === 'belt' && $next['belt'] === $target['belt']
                : $current['belt'] === $target['belt'] && $current['stripes'] === $target['stripes'];
            if ($reached) {
                return ['steps' => $steps, 'reached' => $current];
            }
        }

        return null;
    }

    /**
     * @param list<Step> $steps
     *
     * @return list<array{step: Step, after: PromotionRecord}>
     */
    private function anchored(array $steps, PromotionRecord $after): array
    {
        return array_map(static fn (array $step): array => ['step' => $step, 'after' => $after], $steps);
    }

    /**
     * @param list<array{step: Step, after: PromotionRecord}> $steps
     * @param list<PromotionRecord>                           $rows
     * @param array<string, PromotionRecord>                  $placeholders
     * @param list<string>                                    $skipped
     *
     * @return list<Gap>
     */
    private function gaps(array $steps, array $rows, array $placeholders, array $skipped): array
    {
        $gaps = [];
        foreach ($steps as ['step' => $step, 'after' => $after]) {
            if (\in_array("{$step['belt']->value}:{$step['stripes']}", $skipped, true)) {
                continue;
            }

            $completes = $step['kind'] === 'belt' ? ($placeholders[$step['belt']->value] ?? null) : null;
            $gaps[] = [
                'key' => "{$step['kind']}:{$step['belt']->value}:{$step['stripes']}",
                'kind' => $step['kind'],
                'belt' => $step['belt']->value,
                'from_belt' => $step['kind'] === 'belt' ? $step['from_belt']->value : null,
                'from_stripes' => $step['kind'] === 'stripe' ? $step['from_stripes'] : null,
                'to_stripes' => $step['kind'] === 'stripe' ? $step['stripes'] : null,
                'after' => self::neighbour($after),
                'before' => self::neighbour(self::rowAfter($completes ?? $after, $rows)),
                'completes_promotion_id' => $completes?->id,
            ];
        }

        return $gaps;
    }

    /** @param list<PromotionRecord> $rows */
    private static function rowAfter(PromotionRecord $row, array $rows): ?PromotionRecord
    {
        $position = array_search($row, $rows, true);

        return \is_int($position) ? ($rows[$position + 1] ?? null) : null;
    }

    /** @return Neighbour|null */
    private static function neighbour(?PromotionRecord $row): ?array
    {
        return $row === null ? null : ['promotion_id' => $row->id, 'recorded_at' => $row->day()];
    }
}
