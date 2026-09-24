<?php

declare(strict_types=1);

namespace App\Actions\Promotion;

use App\Models\Athlete;
use App\Models\AthletePromotion;
use App\Models\User;
use Carbon\CarbonImmutable;

/**
 * The first row of an athlete's promotion timeline (#1771): the belt they hold
 * as their Budojo record begins, dated the day it begins.
 *
 * Without it a timeline started empty. A blue belt of nine years, imported
 * from a CSV, read "No promotions yet", and anything measured from the log
 * started from a gap.
 *
 * **Dated now, not at `joined_at`.** An import carries today's belt and the
 * joining date of years ago, and "arrived at blue in 2019" is false for
 * everyone who arrived white and was promoted since. The belt held the day the
 * record starts is the one fact the app actually has; the owner transcribes
 * what came before through the promotions tab. This row says which belt was
 * held that day and nothing about how, so `ValidatesPromotionChainConsistency`
 * does not check a backfill against it: a register goes in oldest-first, or
 * stays incomplete, beneath it.
 *
 * **A belt row only.** A stripe row would assert a change — 0 → 2 — that never
 * happened on this date. This row's date plus the athlete's current stripes
 * already say "two stripes since the record began".
 *
 * `from_belt` is null, which is what marks an arrival rather than a promotion:
 * the belt-promotion achievement and the public timeline both skip it.
 */
class OpenPromotionTimelineAction
{
    public function __construct(
        private readonly CreateAthletePromotionAction $createPromotion,
    ) {
    }

    public function execute(Athlete $athlete, User $recordedBy): AthletePromotion
    {
        return $this->createPromotion->execute(
            athlete: $athlete,
            kind: 'belt',
            fromBelt: null,
            toBelt: $athlete->belt,
            fromStripes: null,
            toStripes: null,
            beltAtEvent: null,
            recordedAt: CarbonImmutable::now(),
            recordedByUserId: $recordedBy->id,
        );
    }
}
