<?php

declare(strict_types=1);

namespace App\Support\MartialArt;

use App\Enums\Belt;
use App\Models\Athlete;
use Carbon\CarbonImmutable;

/**
 * Whether the kids' grades are this athlete's to climb (#1651, #1841).
 *
 * A known date of birth decides by the art's adult divisions, and counts only
 * where the academy trains kids or the athlete is on a kids' grade. An unknown
 * one reads the belt: on a kids' grade, a child; otherwise an adult.
 *
 * One rule for every reader. "Chi promuovere?" asks it about today and the
 * belt held today; the promotion history's gaps (#1966) ask it about the day
 * of each step and the belt held then — a black belt who climbed the kids'
 * grades at nine was a child on those steps, whatever they are now.
 */
final class KidsEligibility
{
    public static function of(Athlete $athlete, MartialArtProfile $profile, bool $trainsKids, Belt $belt, CarbonImmutable $on): bool
    {
        $onKidsGrade = $profile->ladder()->isKidsGrade($belt);
        if ($athlete->date_of_birth === null) {
            return $onKidsGrade;
        }

        return ($trainsKids || $onKidsGrade)
            && ! $profile->isAdultAge(FederationAge::of($athlete->date_of_birth, $on));
    }
}
