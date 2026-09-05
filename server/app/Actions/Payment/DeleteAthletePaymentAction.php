<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\Athlete;
use App\Models\AthletePayment;
use Illuminate\Support\Facades\DB;

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
     *
     * Undoing it also gives that month's sessions back to a carnet, if one
     * covers them (#1380): the monthly fee's precedence is evaluated from the
     * facts, so removing the fee removes the precedence.
     */
    public function execute(Athlete $athlete, int $year, int $month): bool
    {
        return DB::transaction(function () use ($athlete, $year, $month): bool {
            $deleted = AthletePayment::query()
                ->where('athlete_id', $athlete->id)
                ->where('year', $year)
                ->where('month', $month)
                ->delete() > 0;

            if ($deleted) {
                app(ReconcileCarnetEntriesAction::class)->execute([$athlete->id]);
            }

            return $deleted;
        });
    }
}
