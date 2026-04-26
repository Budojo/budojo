<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\Athlete;
use App\Models\AthletePayment;

class DeleteAthletePaymentAction
{
    /**
     * Deletes the payment row for (athlete, year, month). Returns true if
     * a row was deleted, false if no row existed — the controller maps
     * `false` to a 404 to signal "nothing to undo".
     *
     * Hard delete (no soft-delete on this table). A deleted payment is
     * indistinguishable from one that never happened — that's the intent
     * of "undo a paid month".
     */
    public function execute(Athlete $athlete, int $year, int $month): bool
    {
        return AthletePayment::query()
            ->where('athlete_id', $athlete->id)
            ->where('year', $year)
            ->where('month', $month)
            ->delete() > 0;
    }
}
