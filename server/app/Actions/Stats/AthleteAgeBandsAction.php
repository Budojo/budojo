<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Enums\AthleteStatus;
use App\Models\Academy;
use App\Support\MartialArt\AgeDivision;
use App\Support\MartialArt\MartialArtProfile;
use Carbon\CarbonImmutable;

/**
 * Aggregates the academy's active athletes into its federation's age
 * divisions (#1807): IBJJF for BJJ, FIJLKAM's classes for judo and karate,
 * World Taekwondo's for taekwondo — the registry's `age_divisions`, read
 * through `MartialArtProfile`. Always returns every division, empty ones
 * included, so the chart draws the whole distribution.
 *
 * An athlete's age is the one they **reach this calendar year**, which is
 * how all four federations class athletes (FIJLKAM's "dal 12° anno", WT's
 * "the year, not the date"). The chart used to read today's age, which put
 * everyone born after today's date in the division below until their
 * birthday.
 *
 * @return array{bands: list<array{code: string, category: 'kids'|'adults', min: int, max: int|null, count: int}>, total: int, missing_dob: int}
 */
class AthleteAgeBandsAction
{
    /**
     * Pure helper, static so it can be tested without booting the action.
     * The division an age falls in, or null below the youngest.
     *
     * @param list<AgeDivision> $divisions
     */
    public static function bandCodeFor(int $age, array $divisions): ?string
    {
        foreach ($divisions as $division) {
            if ($division->contains($age)) {
                return $division->code;
            }
        }

        return null;
    }

    /**
     * @return array{bands: list<array{code: string, category: 'kids'|'adults', min: int, max: int|null, count: int}>, total: int, missing_dob: int}
     */
    public function execute(Academy $academy): array
    {
        $thisYear = CarbonImmutable::now()->year;
        $divisions = MartialArtProfile::for($academy->martial_art)->ageDivisions();

        // Initialise every band at count 0 so empty bands stay in the
        // response with the canonical shape.
        $counts = [];
        foreach ($divisions as $division) {
            $counts[$division->code] = 0;
        }

        $missingDob = 0;
        $total = 0;

        // Active only (#1538). Without this the bands counted every athlete
        // the academy has ever had, so a chart describing who is on the mat
        // was inflated by everyone who left it — the same defect the belt
        // donut had on the client side, and the same answer the roster has
        // given since #1403.
        $athletes = $academy->athletes()
            ->where('status', AthleteStatus::Active->value)
            ->select(['id', 'date_of_birth'])
            ->get();
        foreach ($athletes as $athlete) {
            $total++;
            $dob = $athlete->date_of_birth;
            if ($dob === null) {
                $missingDob++;

                continue;
            }

            // The age reached this calendar year, not today's (see above).
            $code = self::bandCodeFor($thisYear - $dob->year, $divisions);
            if ($code !== null) {
                $counts[$code]++;
            }
            // Younger than the youngest division: no federation class to
            // put them in. They still count in $total (the academy has them
            // on the roster), but the histogram cannot place them.
        }

        $bands = [];
        foreach ($divisions as $division) {
            $bands[] = [
                'code' => $division->code,
                'category' => $division->category,
                'min' => $division->min,
                'max' => $division->max,
                'count' => $counts[$division->code],
            ];
        }

        return [
            'bands' => $bands,
            'total' => $total,
            'missing_dob' => $missingDob,
        ];
    }
}
