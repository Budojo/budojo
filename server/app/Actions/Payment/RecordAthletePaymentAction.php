<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\Athlete;
use App\Models\AthletePayment;

class RecordAthletePaymentAction
{
    /**
     * Records a payment for the given (athlete, year, month). Idempotent:
     * if a row already exists, returns it instead of creating a duplicate.
     *
     * `createOrFirst()` (NOT `firstOrCreate()`) is the atomic shape — it
     * attempts the INSERT first and falls back to a query on a unique
     * constraint violation. The naive read-then-write pattern would race
     * under concurrency: two POSTs could both miss the initial query and
     * then collide on insert, surfacing a 500 instead of returning the
     * existing row. The DB unique index is the safety net that makes this
     * work — see `create_athlete_payments_table` migration.
     *
     * `amountCents` is supplied by the caller — typically the controller
     * passes the academy's current `monthly_fee_cents` after verifying it
     * is non-null. Snapshotting at the call site means future fee changes
     * do NOT rewrite past records.
     */
    public function execute(Athlete $athlete, int $year, int $month, int $amountCents): AthletePayment
    {
        return AthletePayment::query()->createOrFirst(
            [
                'athlete_id' => $athlete->id,
                'year' => $year,
                'month' => $month,
            ],
            [
                'amount_cents' => $amountCents,
                'paid_at' => now(),
            ],
        );
    }
}
