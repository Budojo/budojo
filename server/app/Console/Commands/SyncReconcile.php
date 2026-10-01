<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Actions\Sync\ReconcileFilesAction;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;

/**
 * What a fast-forward needs outside the database (#2030, PRD § 5.2). The shell
 * runs it once, after it has swapped a staged database in and before the app
 * serves again. **After a rebase, only once the replay has run:** a document
 * uploaded offline has no row in the swapped-in database until the replay
 * recreates it, and this would delete the only copy of its file.
 *
 * - the cache is cleared: on the desktop it is on files (`CACHE_STORE=file`),
 *   and would answer from the old database, the attendance summaries first;
 * - the files no row names any more are deleted (`ReconcileFilesAction`).
 */
class SyncReconcile extends Command
{
    protected $signature = 'budojo:sync-reconcile';

    protected $description = 'After a sync swapped the database: clear the cache, delete the files no row names (#2030)';

    public function handle(ReconcileFilesAction $reconcile): int
    {
        Cache::flush();
        $deleted = $reconcile->execute();

        $this->info("Cache cleared; {$deleted} file(s) no row names deleted.");

        return self::SUCCESS;
    }
}
