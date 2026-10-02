<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Support\Sync\Journal\JournalUploads;
use Illuminate\Support\Facades\DB;

/**
 * After a swap, the database keeps only this device's journal (#2031). The
 * swapped-in database brought the other device's kept entries along; they are
 * that device's to clear, and left here they would come back to it at its
 * next fast-forward, already cleared there. What the database dealt with
 * (`sync_entries`) stays, every device's: that is what keeps a replay from
 * applying anything twice. An unpaired device keeps no journal at all.
 * The kept uploads no remaining entry names are swept with them.
 */
final class KeepOwnJournalAction
{
    public function __construct(private readonly JournalUploads $uploads)
    {
    }

    public function execute(?string $device): int
    {
        $others = DB::table('sync_journal');
        if ($device !== null && $device !== '') {
            $others->where('device', '!=', $device);
        }

        $dropped = $others->delete();
        // And the uploads no kept entry names any more: the dropped rows'
        // and, rarely, one kept just before a commit that failed.
        $this->uploads->sweep();

        return $dropped;
    }
}
