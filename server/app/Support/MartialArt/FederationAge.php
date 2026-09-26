<?php

declare(strict_types=1);

namespace App\Support\MartialArt;

use Carbon\CarbonInterface;

/**
 * The age a federation classes an athlete by (#1807): the one they **reach
 * this calendar year**, not today's. All four federations count this way
 * (FIJLKAM's "dal 12° anno", WT's "the year, not the date"), so someone born
 * in November is in this year's division from January.
 */
final class FederationAge
{
    public static function of(CarbonInterface $dateOfBirth, CarbonInterface $today): int
    {
        return $today->year - $dateOfBirth->year;
    }
}
