<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\Academy;

class ReconcileAcademyCarnetsAction
{
    public function __construct(
        private readonly ReconcileCarnetEntriesAction $reconcileEntries,
    ) {
    }

    /**
     * Rebuilds the ledger of every carnet the academy has ever sold (#1576).
     *
     * The per-athlete reconciliation is a function of the athlete's facts
     * and of one academy setting — what an entry pays for. The facts change
     * one athlete at a time and are reconciled at the source; the setting
     * changes for everybody at once, and this is where everybody is
     * recomputed. Only athletes holding a carnet: the others have no ledger
     * to rebuild, and an academy's roster is far larger than its carnet
     * customers. Archived athletes included — a restore does not reconcile,
     * so one left out here would come back with a ledger under the old rule.
     */
    public function execute(Academy $academy): void
    {
        $athleteIds = array_values(array_map(
            static fn (mixed $id): int => is_numeric($id) ? (int) $id : 0,
            $academy->athletes()->withTrashed()->whereHas('carnets')->pluck('id')->all(),
        ));

        $this->reconcileEntries->execute($athleteIds);
    }
}
