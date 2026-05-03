<?php

declare(strict_types=1);

namespace App\Actions\Stats;

use App\Models\Academy;
use Carbon\CarbonImmutable;

/**
 * Aggregates the academy's athletes into the canonical IBJJF age
 * divisions (Mighty Mite → Master 7), bucketing by the athlete's age
 * AS OF TODAY. Always returns all 13 bands — empty bands keep their
 * shape so the frontend can render the full distribution.
 *
 * The IBJJF band table lives here as a private constant. Single
 * consumer today; if a second one ever needs it, extract to a
 * shared value object then. KISS until duplication forces extraction.
 *
 * @return array{bands: list<array{code: string, category: 'kids'|'adults', min: int, max: int|null, count: int}>, total: int, missing_dob: int}
 */
class AthleteAgeBandsAction
{
    /**
     * IBJJF age divisions, canonical order (kids → adults), inclusive
     * lower and upper bounds. `max: null` means open-ended (master_7).
     *
     * @var list<array{code: string, category: 'kids'|'adults', min: int, max: int|null}>
     */
    private const array BANDS = [
        ['code' => 'mighty_mite', 'category' => 'kids',   'min' => 4,  'max' => 6],
        ['code' => 'pee_wee',     'category' => 'kids',   'min' => 7,  'max' => 9],
        ['code' => 'junior',      'category' => 'kids',   'min' => 10, 'max' => 12],
        ['code' => 'teen',        'category' => 'kids',   'min' => 13, 'max' => 15],
        ['code' => 'juvenile',    'category' => 'adults', 'min' => 16, 'max' => 17],
        ['code' => 'adult',       'category' => 'adults', 'min' => 18, 'max' => 29],
        ['code' => 'master_1',    'category' => 'adults', 'min' => 30, 'max' => 35],
        ['code' => 'master_2',    'category' => 'adults', 'min' => 36, 'max' => 40],
        ['code' => 'master_3',    'category' => 'adults', 'min' => 41, 'max' => 45],
        ['code' => 'master_4',    'category' => 'adults', 'min' => 46, 'max' => 50],
        ['code' => 'master_5',    'category' => 'adults', 'min' => 51, 'max' => 55],
        ['code' => 'master_6',    'category' => 'adults', 'min' => 56, 'max' => 60],
        ['code' => 'master_7',    'category' => 'adults', 'min' => 61, 'max' => null],
    ];

    /**
     * Pure helper — exposed as static for unit testing without booting
     * the full action. Returns the IBJJF band code for an integer age,
     * or null if below the youngest division (under 4).
     */
    public static function bandCodeFor(int $age): ?string
    {
        foreach (self::BANDS as $band) {
            if ($age < $band['min']) {
                continue;
            }
            if ($band['max'] === null || $age <= $band['max']) {
                return $band['code'];
            }
        }

        return null;
    }

    /**
     * @return array{bands: list<array{code: string, category: 'kids'|'adults', min: int, max: int|null, count: int}>, total: int, missing_dob: int}
     */
    public function execute(Academy $academy): array
    {
        $today = CarbonImmutable::now();

        // Initialise every band at count 0 so empty bands stay in the
        // response with the canonical shape.
        $counts = [];
        foreach (self::BANDS as $band) {
            $counts[$band['code']] = 0;
        }

        $missingDob = 0;
        $total = 0;

        $athletes = $academy->athletes()->select(['id', 'date_of_birth'])->get();
        foreach ($athletes as $athlete) {
            $total++;
            $dob = $athlete->date_of_birth;
            if ($dob === null) {
                $missingDob++;

                continue;
            }

            $age = CarbonImmutable::parse($dob)->diffInYears($today);
            $code = self::bandCodeFor((int) $age);
            if ($code !== null) {
                $counts[$code]++;
            }
            // ages below 4 are silently dropped from band counts — they
            // aren't a defined IBJJF division. They still count in $total
            // (the academy has them on the roster), but the histogram
            // can't place them.
        }

        $bands = [];
        foreach (self::BANDS as $band) {
            $bands[] = [
                'code' => $band['code'],
                'category' => $band['category'],
                'min' => $band['min'],
                'max' => $band['max'],
                'count' => $counts[$band['code']],
            ];
        }

        return [
            'bands' => $bands,
            'total' => $total,
            'missing_dob' => $missingDob,
        ];
    }
}
