<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Enums\BillingPeriod;
use App\Models\Athlete;
use App\Models\AthletePayment;
use App\Support\OperatorDay;
use Carbon\CarbonImmutable;

/**
 * Lets an athlete off one month (#2167): someone who helped with the gym does
 * not pay October. Not «Si allena gratis» (#2011), a personal fee of 0 from
 * now on, and not a payment: no money came in.
 *
 * It is a row on the ledger all the same, so every "who owes" rule reads the
 * month as settled with no change of its own: the unpaid list, the reminders,
 * the arrears, the ledger's «In ritardo», the carnet it spares. At €0 and
 * marked `waived`, so what counts money leaves it out, and the athlete is not
 * told their payment arrived.
 */
class WaiveAthleteMonthAction
{
    public function __construct(
        private readonly WritePaymentRowAction $writeRow,
    ) {
    }

    /**
     * One month, whatever period the athlete pays by: a quarter let off would
     * be three months the owner did not name. Dated the day the owner gave
     * it, today unless said: a sync replays it with the day it was given.
     */
    public function execute(Athlete $athlete, int $year, int $month, ?CarbonImmutable $on = null): AthletePayment
    {
        return $this->writeRow->execute(new AthletePayment([
            'athlete_id' => $athlete->id,
            'year' => $year,
            'month' => $month,
            'period_months' => BillingPeriod::Monthly,
            'amount_cents' => 0,
            'paid_at' => $on?->startOfDay() ?? OperatorDay::today(),
            'payment_method' => null,
            'waived' => true,
        ]));
    }
}
