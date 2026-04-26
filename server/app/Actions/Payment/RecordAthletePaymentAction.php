<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\Athlete;
use App\Models\AthletePayment;

class RecordAthletePaymentAction
{
    /**
     * Records a payment for the given (athlete, year, month). Idempotent:
     * if a row already exists, returns it instead of attempting a duplicate
     * insert that would hit the unique-index constraint.
     *
     * `amountCents` is supplied by the caller — typically the controller
     * passes the academy's current `monthly_fee_cents` after verifying it
     * is non-null. Snapshotting at the call site means future fee changes
     * do NOT rewrite past records.
     */
    public function execute(Athlete $athlete, int $year, int $month, int $amountCents): AthletePayment
    {
        $existing = AthletePayment::query()
            ->where('athlete_id', $athlete->id)
            ->where('year', $year)
            ->where('month', $month)
            ->first();

        if ($existing !== null) {
            return $existing;
        }

        return AthletePayment::create([
            'athlete_id' => $athlete->id,
            'year' => $year,
            'month' => $month,
            'amount_cents' => $amountCents,
            'paid_at' => now(),
        ]);
    }
}
