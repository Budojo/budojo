<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

use App\Actions\Payment\ReleaseCarnetEntryAction;
use App\Models\AttendanceRecord;
use Illuminate\Support\Facades\DB;

class DeleteAttendanceAction
{
    public function __construct(
        private readonly ReleaseCarnetEntryAction $releaseCarnetEntry,
    ) {
    }

    /**
     * Soft-delete an attendance record, giving back the carnet entry it
     * consumed (#1364). Both in one transaction: a presence removed without
     * its entry released would silently cost the athlete a session they paid
     * for, and the correct-a-mistake flow (delete the wrong row, insert the
     * right one) would charge twice for one session.
     */
    public function execute(AttendanceRecord $record): void
    {
        DB::transaction(function () use ($record): void {
            $this->releaseCarnetEntry->execute($record);
            $record->delete();
        });
    }
}
