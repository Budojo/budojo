<?php

declare(strict_types=1);

namespace App\Support\Promotion;

use App\Enums\Belt;
use App\Models\AthletePromotion;
use App\Support\OperatorDay;
use Carbon\CarbonImmutable;

/**
 * One promotion row, as the gap finder reads it (#1966): what it records, and
 * the belt and count it leaves the athlete on.
 */
final readonly class PromotionRecord
{
    /**
     * @param 'belt'|'stripe' $kind
     */
    public function __construct(
        public int $id,
        public string $kind,
        public ?Belt $fromBelt,
        public ?Belt $toBelt,
        public ?int $fromStripes,
        public ?int $toStripes,
        public Belt $beltAtEvent,
        public CarbonImmutable $recordedAt,
        // A starting row still on the day the athlete was entered (#1990) —
        // see EntryPlaceholder. Only read for a starting row.
        public bool $entryPlaceholder = true,
    ) {
    }

    /**
     * @param bool $entryPlaceholder whether a starting row is still on the day the
     *                               athlete was entered ({@see EntryPlaceholder::is()})
     */
    public static function of(AthletePromotion $promotion, bool $entryPlaceholder = true): self
    {
        return new self(
            $promotion->id,
            $promotion->kind,
            $promotion->from_belt,
            $promotion->to_belt,
            $promotion->from_stripes,
            $promotion->to_stripes,
            $promotion->belt_at_event,
            CarbonImmutable::make($promotion->recorded_at) ?? OperatorDay::today(),
            $entryPlaceholder,
        );
    }

    /**
     * A belt row with no belt before it: the row every timeline opens with
     * when an athlete is created (#1771), or a backfilled "first belt".
     */
    public function isOpening(): bool
    {
        return $this->kind === 'belt' && $this->fromBelt === null;
    }

    /**
     * A starting row that is still the placeholder written when the athlete
     * was entered (#1990): its belt is known, its day and the count on it are
     * not. Once the owner dates it — the pencil, or completing it (#1974) — it
     * is the real start instead: they arrived on that belt that day, with none.
     */
    public function isPlaceholder(): bool
    {
        return $this->isOpening() && $this->entryPlaceholder;
    }

    /**
     * A stripe row that raises nothing — the 4 → 0 reset a live promotion
     * writes beside the belt row. Not a step (#1772 skips it the same way).
     */
    public function isReset(): bool
    {
        return $this->kind === 'stripe' && ($this->toStripes ?? 0) <= ($this->fromStripes ?? 0);
    }

    /** The belt this row leaves the athlete on. */
    public function belt(): Belt
    {
        return $this->kind === 'belt' && $this->toBelt !== null ? $this->toBelt : $this->beltAtEvent;
    }

    /** The count this row leaves the athlete on: a belt opens on none. */
    public function stripes(): int
    {
        return $this->kind === 'stripe' ? ($this->toStripes ?? 0) : 0;
    }

    public function day(): string
    {
        return $this->recordedAt->toDateString();
    }
}
