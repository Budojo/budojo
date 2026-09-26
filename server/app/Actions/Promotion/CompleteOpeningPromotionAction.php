<?php

declare(strict_types=1);

namespace App\Actions\Promotion;

use App\Enums\Belt;
use App\Models\AthletePromotion;
use Carbon\CarbonImmutable;

class CompleteOpeningPromotionAction
{
    /**
     * Completes the row a timeline opens with (#1771, #1966): the belt the
     * athlete came from, and the day the promotion really happened, instead
     * of the day they were typed into Budojo.
     *
     * The one exception to "the transition a row describes is immutable":
     * a starting row does not describe a transition, it stands in for one
     * nobody had written down yet. Completing it — rather than adding a
     * second row for the same belt — is what moves "Su questa cintura dal…"
     * (#1772) off the data-entry date.
     *
     * Like every history write, it goes straight to the row and never touches
     * `Athlete::$belt` / `Athlete::$stripes`, so the `AthleteObserver` does
     * not fire. The request has already checked that the row is a starting
     * one and that the belt fits the history around it.
     */
    public function execute(AthletePromotion $promotion, Belt $fromBelt, CarbonImmutable $recordedAt): AthletePromotion
    {
        $promotion->update(['from_belt' => $fromBelt, 'recorded_at' => $recordedAt]);

        $refreshed = $promotion->fresh();
        \assert($refreshed instanceof AthletePromotion); // the row was updated one statement ago

        return $refreshed;
    }
}
