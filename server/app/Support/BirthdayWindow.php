<?php

declare(strict_types=1);

namespace App\Support;

use Carbon\CarbonImmutable;

/**
 * The days a birthday filter covers (#1754), as month-days: `03-14`.
 *
 * A **set**, never a range. `BETWEEN '12-29' AND '01-04'` matches nothing,
 * because the new year sorts before the old one. Adding days to a real date
 * and formatting each one gets the year boundary right without a special
 * case.
 *
 * The one special case is someone born on 29 February. In a leap year their
 * birthday is the 29th, which the walk finds on its own. In any other year it
 * is **28 February**: without that they would be missed three years in four.
 * The client's `birthdayIn()` holds the same rule.
 */
final class BirthdayWindow
{
    private const string LEAP_DAY = '02-29';

    /**
     * `today` is one day; `week` is today and the six after it. Anything else
     * is not a window, and the caller applies no filter — the roster ignores
     * a value it does not know rather than refusing it.
     *
     * @return list<string>|null
     */
    public static function monthDays(mixed $window, CarbonImmutable $today): ?array
    {
        $length = match ($window) {
            'today' => 1,
            'week' => 7,
            default => null,
        };
        if ($length === null) {
            return null;
        }

        $days = [];
        foreach (range(0, $length - 1) as $ahead) {
            $day = $today->addDays($ahead);
            $days[] = $day->format('m-d');
            if ($day->format('m-d') === '02-28' && ! $day->isLeapYear()) {
                $days[] = self::LEAP_DAY;
            }
        }

        return $days;
    }
}
