<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Actions\Sync\KeepOwnJournalAction;
use App\Actions\Sync\ReconcileFilesAction;
use App\Actions\Sync\RecordHomecomingAction;
use App\Actions\Sync\ReplayJournalAction;
use App\Support\Sync\RebasePending;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

/**
 * What a fast-forward needs outside the database (#2030, PRD § 5.2). The shell
 * runs it once, after it has swapped a staged database in and before the app
 * serves again. **A rebase replays first** (#2031 step 3): a document uploaded
 * offline has no row in the swapped-in database until the replay recreates it,
 * and sweeping before would delete the only copy of its file.
 *
 * - the cache is cleared: on the desktop it is on files (`CACHE_STORE=file`),
 *   and would answer from the old database, the attendance summaries first;
 * - a rebase's set-aside journal is replayed (`ReplayJournalAction`);
 * - what the other device's journal brought is told on Oggi
 *   (`RecordHomecomingAction`, #2039), while the journal still holds it;
 * - the journal keeps only this device's entries, and the kept uploads no
 *   entry names go (`KeepOwnJournalAction`, #2031);
 * - the files no row names any more are deleted (`ReconcileFilesAction`).
 */
class SyncReconcile extends Command
{
    protected $signature = 'budojo:sync-reconcile';

    protected $description = 'After a sync swapped the database: clear the cache, delete the files no row names (#2030)';

    public function handle(
        ReconcileFilesAction $reconcile,
        KeepOwnJournalAction $keepOwnJournal,
        ReplayJournalAction $replay,
        RecordHomecomingAction $homecoming,
    ): int {
        Cache::flush();

        // A rebase: this device's writes, set aside at the stage, replayed on
        // the database swapped in, **before anything is swept**. Until the
        // replay keeps its entries again, no row names a photo or a document
        // uploaded offline, and the journal's sweep or the files' reconcile
        // would delete the only copy. The file goes only once every entry is
        // dealt with; a replay that stops is taken up at the next start, and
        // skips what it already did.
        $pending = RebasePending::read();
        $replayed = '';
        if ($pending !== null) {
            $outcomes = $replay->execute($pending['device'], $pending['entries']);
            $counts = array_count_values($outcomes);
            ksort($counts);
            $replayed = ' Rebase: ' . json_encode($counts) . '.';
            RebasePending::clear();
        }

        $device = config('budojo.sync.device');
        $device = \is_string($device) ? $device : null;
        // After the replay, so it counts what is still there; before the
        // journal drops the other device's entries, which it reads.
        $homecoming->execute($device);
        $forgotten = $keepOwnJournal->execute($device);
        $deleted = $reconcile->execute();

        $this->info("Cache cleared; {$deleted} file(s) no row names deleted; {$forgotten} other device journal entr(ies) dropped.{$replayed}");

        return self::SUCCESS;
    }
}
