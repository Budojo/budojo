<?php

declare(strict_types=1);

namespace App\Actions\Promotion;

use App\Models\Academy;
use App\Models\Athlete;
use App\Support\MartialArt\KidsEligibility;
use App\Support\MartialArt\MartialArtProfile;
use App\Support\OperatorDay;

/**
 * An athlete's next step on the academy's ladder (#1841, #2045): the next
 * stripe while the grade has room, then the next grade in the order people
 * climb it, the kids' grades only for a child ({@see KidsEligibility}).
 *
 * One place for it, read by «Chi promuovere?» for the whole roster and by the
 * phone's promotion sheet for one athlete, so the two never propose different
 * steps.
 */
final class GetAthleteNextStepAction
{
    /**
     * @return array{kind: 'stripe'|'belt', belt: string, stripes: int}|null
     */
    public function execute(Athlete $athlete, Academy $academy): ?array
    {
        return $this->of($athlete, MartialArtProfile::for($academy->martial_art), $academy->trains_kids);
    }

    /**
     * The same, with the academy's profile already in hand: a roster asks it
     * once for everyone.
     *
     * @return array{kind: 'stripe'|'belt', belt: string, stripes: int}|null
     */
    public function of(Athlete $athlete, MartialArtProfile $profile, bool $trainsKids): ?array
    {
        $next = $profile->ladder()->nextStep(
            $athlete->belt,
            $athlete->stripes,
            KidsEligibility::of($athlete, $profile, $trainsKids, $athlete->belt, OperatorDay::today()),
        );

        return $next === null ? null : [...$next, 'belt' => $next['belt']->value];
    }
}
