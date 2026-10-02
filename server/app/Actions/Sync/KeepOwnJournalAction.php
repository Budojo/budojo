<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use Illuminate\Support\Facades\DB;

/**
 * After a swap, the database keeps only this device's journal (#2031). The
 * swapped-in database brought the other device's kept entries along; they are
 * that device's to clear, and left here they would come back to it at its
 * next fast-forward, already cleared there. What the database dealt with
 * (`sync_entries`) stays, every device's: that is what keeps a replay from
 * applying anything twice. An unpaired device keeps no journal at all.
 */
final class KeepOwnJournalAction
{
    public function execute(?string $device): int
    {
        $others = DB::table('sync_journal');
        if ($device !== null && $device !== '') {
            $others->where('device', '!=', $device);
        }

        return $others->delete();
    }
}
