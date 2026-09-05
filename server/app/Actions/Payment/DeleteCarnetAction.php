<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\Carnet;
use Illuminate\Support\Facades\DB;

class DeleteCarnetAction
{
    public function __construct(
        private readonly ReconcileCarnetEntriesAction $reconcileCarnets,
    ) {
    }

    /**
     * Removes a carnet sold by mistake (#1380).
     *
     * The PRD originally ruled this out — "a sold carnet is a fact" — but
     * getting the sale wrong is far likelier than wanting to rewrite history,
     * and there was no way back from a mistyped date.
     *
     * The sessions it paid for **stay**. They are attendance, not money: the
     * register records what happened, and they simply become uncovered — unless
     * another carnet's window can take them, which is why the whole athlete is
     * reconciled rather than the rows being dropped with the carnet.
     *
     * How many sessions lose their cover is what the caller shows the owner
     * before this runs; see `CarnetController::destroy`.
     */
    public function execute(Carnet $carnet): void
    {
        DB::transaction(function () use ($carnet): void {
            $athleteId = $carnet->athlete_id;
            $carnet->delete();

            $this->reconcileCarnets->execute([$athleteId]);
        });
    }
}
