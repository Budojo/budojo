<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * How long one payment covers (#1382).
 *
 * The backing value is the number of months, which is the only thing the
 * coverage rule actually needs — `AthletePayment::scopeCovering()` does
 * arithmetic on it, not a lookup table. Naming the four cases rather than
 * accepting any integer keeps the UI to a short list (Hick) and keeps
 * "somebody paid for 7 months" out of the data.
 *
 * The period **runs from the month it starts in**, not from a calendar
 * quarter: an athlete who pays quarterly in February is covered February to
 * April. That is what happens in a gym — people join when they join — and it
 * removes the pro-rata first period, which would be a feature of its own.
 */
enum BillingPeriod: int
{
    case Monthly = 1;
    case Quarterly = 3;
    case HalfYearly = 6;
    case Annual = 12;

    /**
     * The month counts, for validation rules and for the `athletes` column
     * default. Keeps the four numbers in one place instead of spelled out
     * again in every FormRequest.
     *
     * @return list<int>
     */
    public static function months(): array
    {
        return array_map(static fn (self $case): int => $case->value, self::cases());
    }
}
