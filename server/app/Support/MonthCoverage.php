<?php

declare(strict_types=1);

namespace App\Support;

use App\Enums\PaymentCoverage;
use App\Models\AthletePayment;
use App\Models\Carnet;

/**
 * What is paying for an athlete's month (#1402).
 *
 * One rule, in one place, for a question three surfaces ask: the roster
 * column, the athlete's own page, and anything that later wants to say more
 * than "paid / unpaid".
 *
 * **The monthly fee wins over the carnet**, and that is not a new decision
 * taken here — it is the rule `ReconcileCarnetEntriesAction` has applied since
 * #1380, where a month covered by a fee charges no carnet entry. What this
 * class must not do is invent a second answer to a question the domain has
 * already settled; a roster that ranked them the other way would contradict
 * the ledger it is summarising.
 */
final class MonthCoverage
{
    /**
     * @param  AthletePayment|null  $payment  the payment covering the month, if any
     * @param  Carnet|null  $carnet  the athlete's spendable carnet today, if any
     */
    public static function resolve(?AthletePayment $payment, ?Carnet $carnet): PaymentCoverage
    {
        if ($payment !== null) {
            return PaymentCoverage::forPeriod($payment->period_months);
        }

        return $carnet !== null ? PaymentCoverage::Carnet : PaymentCoverage::None;
    }
}
