<?php

declare(strict_types=1);

namespace App\Actions\Promotion;

use App\Enums\Belt;
use App\Models\Athlete;
use App\Models\AthletePromotion;
use Carbon\CarbonImmutable;

class CreateAthletePromotionAction
{
    /**
     * Backfills a historical promotion (#1431 PR 2 of 2) — the piece that
     * lets an academy transcribe a paper register.
     *
     * Writes straight to the `AthletePromotion` row through Eloquent, the
     * same as `UpdateAthletePromotionRecordedAtAction`: never through
     * `Athlete::$belt` / `Athlete::$stripes`, so it cannot trigger
     * `AthleteObserver` — no spurious `CommunityPost`, no notification
     * fanout, and the athlete's CURRENT belt or stripes cannot be dragged
     * around by adding a row to their past. `recordedByUserId` is always
     * the caller transcribing the register now, never a guess at who
     * recorded the real-world event (#1431).
     *
     * Chain consistency (does this row contradict its neighbours) is
     * enforced by `StoreAthletePromotionRequest` before a backfill reaches
     * here, so this is a straight insert. The other caller is
     * `OpenPromotionTimelineAction` (#1771), whose starting row on a fresh
     * athlete has no neighbours to contradict.
     */
    public function execute(
        Athlete $athlete,
        string $kind,
        ?Belt $fromBelt,
        ?Belt $toBelt,
        ?int $fromStripes,
        ?int $toStripes,
        ?Belt $beltAtEvent,
        CarbonImmutable $recordedAt,
        int $recordedByUserId,
    ): AthletePromotion {
        // belt_at_event always equals to_belt on a belt-kind row — derived
        // here rather than trusted from a second, possibly-disagreeing
        // input for the same fact (docs/entities/athlete-promotion.md).
        $resolvedBeltAtEvent = $kind === 'belt' ? $toBelt : $beltAtEvent;
        \assert($resolvedBeltAtEvent instanceof Belt); // the FormRequest guarantees one of the two branches

        return AthletePromotion::create([
            'athlete_id' => $athlete->id,
            'kind' => $kind,
            'from_belt' => $fromBelt,
            'to_belt' => $toBelt,
            'from_stripes' => $fromStripes,
            'to_stripes' => $toStripes,
            'belt_at_event' => $resolvedBeltAtEvent,
            'recorded_at' => $recordedAt,
            'recorded_by_user_id' => $recordedByUserId,
        ]);
    }
}
