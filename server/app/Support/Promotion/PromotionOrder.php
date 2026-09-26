<?php

declare(strict_types=1);

namespace App\Support\Promotion;

use App\Support\MartialArt\RankLadder;

/**
 * The order an athlete's promotion rows happened in (#1966) — the one order
 * the gaps are replayed in and the timeline is listed in (newest first, its
 * reverse), so a ghost row always sits between the rows its window names.
 *
 * Oldest first. Rows sharing a moment — since #1963 every row of a day is
 * stored at the owner's midnight — go by where each one **starts** on the
 * ladder, then by id:
 *
 * - a starting row starts on its own belt, before anything else on it: a
 *   same-day correction off it (created on purple by mistake, then
 *   purple → blue) comes after it, the way it was made;
 * - a stripe row starts at its `from_stripes`, so two stripes transcribed
 *   newest first are still one then two;
 * - a belt row starts where it leaves its `from_belt`, after the stripes on
 *   that belt.
 *
 * Not by id alone: a step filled on the day of the row after it (its window
 * ends on that day, inclusive) is written later but happened before it. Not
 * by where a row ends, which replays a downward correction backwards.
 */
final class PromotionOrder
{
    public function __construct(private readonly RankLadder $ladder)
    {
    }

    /**
     * @param list<PromotionRecord> $records
     *
     * @return list<PromotionRecord>
     */
    public function chronological(array $records): array
    {
        usort($records, fn (PromotionRecord $a, PromotionRecord $b): int => [
            $a->recordedAt->getTimestamp(),
            ...$this->start($a),
            $a->id,
        ] <=> [
            $b->recordedAt->getTimestamp(),
            ...$this->start($b),
            $b->id,
        ]);

        return $records;
    }

    /**
     * Where a row starts on the ladder: the climb position of the belt it
     * starts on, then how far along that belt.
     *
     * @return array{int, int}
     */
    private function start(PromotionRecord $row): array
    {
        if ($row->isOpening()) {
            return [$this->ladder->climbPosition($row->belt()) ?? PHP_INT_MAX, -1];
        }
        if ($row->kind === 'belt') {
            return [$this->ladder->climbPosition($row->fromBelt ?? $row->belt()) ?? PHP_INT_MAX, PHP_INT_MAX];
        }

        return [$this->ladder->climbPosition($row->beltAtEvent) ?? PHP_INT_MAX, $row->fromStripes ?? 0];
    }
}
