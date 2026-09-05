<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

use App\Actions\Payment\ReconcileCarnetEntriesAction;
use App\Models\AttendanceRecord;
use Illuminate\Support\Facades\DB;

class DeleteAttendanceAction
{
    public function __construct(
        private readonly ReconcileCarnetEntriesAction $reconcileCarnets,
    ) {
    }

    /**
     * Soft-delete an attendance record and recompute the athlete's carnet
     * ledger (#1380). Both in one transaction: a session that no longer exists
     * must stop counting, or the correct-a-mistake flow (delete the wrong row,
     * mark the right one) charges twice for one session.
     *
     * The release is no longer an explicit refund — the presence leaves the set
     * the ledger is derived from, and the entry goes with it. A second carnet
     * whose window also covered that day may now pick up a different session,
     * which is why the whole athlete is recomputed rather than one row deleted.
     */
    public function execute(AttendanceRecord $record): void
    {
        DB::transaction(function () use ($record): void {
            $record->delete();
            $this->reconcileCarnets->execute([$record->athlete_id]);
        });
    }
}
