<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\Carnet;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

class UpdateCarnetValidityAction
{
    public function __construct(
        private readonly ReconcileCarnetEntriesAction $reconcileCarnets,
    ) {
    }

    /**
     * Moves when a carnet starts covering sessions (#1380).
     *
     * The expiry moves with it: the window is always twelve months, so pulling
     * the start back six months spends six months of life rather than adding
     * them. That is deliberate — "valid twelve months" is what an athlete is
     * told — and it is the reason the UI has to show the new expiry before the
     * owner confirms, not after.
     *
     * Re-dating changes which sessions fall inside the window, so the ledger is
     * rebuilt in the same transaction. It can move in either direction: a later
     * start releases sessions, an earlier one claims sessions the register was
     * already holding.
     */
    public function execute(Carnet $carnet, CarbonImmutable $validFrom): Carnet
    {
        return DB::transaction(function () use ($carnet, $validFrom): Carnet {
            $carnet->update([
                'valid_from' => $validFrom->toDateString(),
                'expires_at' => $validFrom->addMonthsNoOverflow(SellCarnetAction::VALIDITY_MONTHS)->toDateString(),
            ]);

            $this->reconcileCarnets->execute([$carnet->athlete_id]);

            $refreshed = $carnet->fresh();
            // The row was updated two statements ago inside this transaction;
            // `fresh()` is nullable only for a model deleted underneath us.
            \assert($refreshed instanceof Carnet);

            return $refreshed->loadCount('entries');
        });
    }
}
