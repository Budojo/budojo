<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\AttendanceRecord;
use App\Models\CarnetEntry;

class ReleaseCarnetEntryAction
{
    /**
     * Gives back the entry a presence consumed, if it consumed one.
     *
     * Every path that removes a presence must call this. Without it the
     * ordinary correct-a-mistake flow — soft-delete the wrong row, insert the
     * right one — would charge two entries for one session, and the athlete
     * would silently lose one they paid for.
     *
     * The deletion is **hard** while the attendance row is only soft-deleted:
     * a released entry is spendable again and must not keep counting against
     * the balance. The attendance tombstone remains the audit trail of what
     * happened.
     */
    public function execute(AttendanceRecord $record): void
    {
        CarnetEntry::query()
            ->where('attendance_record_id', $record->id)
            ->delete();
    }
}
