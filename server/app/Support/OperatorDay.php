<?php

declare(strict_types=1);

namespace App\Support;

use Carbon\CarbonImmutable;

/**
 * Which calendar day it is for the owner (#1963).
 *
 * The app stores and compares in UTC, and it should. But "today" in a date
 * rule or a default is a question about the person at the desk: at 00:30 in
 * Rome it is already the 11th, while UTC still says the 10th. Judged in UTC,
 * tonight's class was "in the future" for two hours after midnight, and a
 * payment recorded then was dated the day before.
 *
 * The day is returned the way the app stores a date — midnight of that
 * calendar day in the app's timezone — so it compares and persists exactly
 * like a `Y-m-d` the owner picked. Midnight in Rome would be 22:00 UTC of the
 * day before, and would store the wrong date.
 */
final class OperatorDay
{
    /** The owner's timezone, from config; the app's own as a last resort. */
    public static function timezone(): string
    {
        $timezone = config('budojo.operator_timezone');
        if (\is_string($timezone) && $timezone !== '') {
            return $timezone;
        }

        $app = config('app.timezone');

        return \is_string($app) ? $app : 'UTC';
    }

    public static function today(): CarbonImmutable
    {
        return CarbonImmutable::parse(CarbonImmutable::now(self::timezone())->toDateString());
    }

    /** `today` as a validation bound: "no later than the owner's today". */
    public static function notAfterToday(): string
    {
        return 'before_or_equal:' . self::today()->toDateString();
    }
}
