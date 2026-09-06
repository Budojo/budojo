<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * How an athlete's current month is paid for (#1402).
 *
 * The roster used to answer this with a boolean, because when it was written
 * the only way to pay was a monthly fee. Carnets (#1364) and billing periods
 * (#1382) arrived since, and the boolean never grew: an athlete who had bought
 * a €70 carnet the week before read as **Non pagato**, which is technically
 * true of the month and false about the person.
 *
 * So the roster says which of these it is instead of whether it is any of
 * them.
 */
enum PaymentCoverage: string
{
    /** A payment covering exactly this month. */
    case Monthly = 'monthly';
    /** A payment whose three-month period contains this month. */
    case Quarterly = 'quarterly';
    case HalfYearly = 'half_yearly';
    case Annual = 'annual';
    /** No fee covers the month, but the athlete holds a spendable carnet. */
    case Carnet = 'carnet';
    /** Nothing covers the month. The only state that asks for anything. */
    case None = 'none';

    /**
     * The shape a fee payment takes, by how long its period runs.
     *
     * Deliberately exhaustive over `BillingPeriod` rather than a lookup with a
     * default: adding a period there should fail to compile here, not quietly
     * fall through to "monthly".
     */
    public static function forPeriod(BillingPeriod $period): self
    {
        return match ($period) {
            BillingPeriod::Monthly => self::Monthly,
            BillingPeriod::Quarterly => self::Quarterly,
            BillingPeriod::HalfYearly => self::HalfYearly,
            BillingPeriod::Annual => self::Annual,
        };
    }
}
