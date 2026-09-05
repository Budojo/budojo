<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\Athlete;
use App\Models\AthletePayment;
use Illuminate\Support\Facades\DB;

class DeleteAthletePaymentAction
{
    public function __construct(
        private readonly ReconcileCarnetEntriesAction $reconcileCarnets,
    ) {
    }

    /**
     * Deletes the payment **covering** (athlete, year, month). Returns true if
     * one was deleted, false if none covered it — the controller maps `false`
     * to a 404 to signal "nothing to undo".
     *
     * Covering, not starting there (#1382): the owner looking at April clicks
     * unmark, and the quarterly that started in February is what comes off.
     * Keying the route on the month the period *starts* in would make a
     * quarterly undeletable from two of the three months it pays for.
     *
     * The whole period goes. That is the decision on the issue: one payment,
     * one receipt, one deletion. Releasing a single month would leave the
     * amount on the row no longer matching what it covers, and a partial
     * refund is an accounting event Budojo does not model.
     *
     * Hard delete (no soft-delete on this table). A deleted payment is
     * indistinguishable from one that never happened — that's the intent
     * of "undo a paid month".
     *
     * Undoing it also gives those months' sessions back to a carnet, if one
     * covers them (#1380): the monthly fee's precedence is evaluated from the
     * facts, so removing the fee removes the precedence.
     */
    public function execute(Athlete $athlete, int $year, int $month): bool
    {
        return DB::transaction(function () use ($athlete, $year, $month): bool {
            $deleted = AthletePayment::query()
                ->where('athlete_id', $athlete->id)
                ->covering($year, $month)
                ->delete() > 0;

            if ($deleted) {
                $this->reconcileCarnets->execute([$athlete->id]);
            }

            return $deleted;
        });
    }
}
