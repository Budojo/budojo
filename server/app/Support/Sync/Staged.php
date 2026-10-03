<?php

declare(strict_types=1);

namespace App\Support\Sync;

/**
 * What a stage leaves for the shell to swap in at its next start (#2030,
 * #2079): a database beside the live one, and, from a restore, the academy's
 * files beside `storage/app`.
 *
 * **The staged database commits a stage,** so it is the first thing cleared
 * and the last thing written. A stage that stops anywhere in between leaves
 * at most files with no database beside them, which the shell deletes, never
 * an earlier database beside other files, or beside none.
 */
final class Staged
{
    public static function clear(): void
    {
        foreach ([SyncDatabase::stagedPath(), SyncDatabase::stagedPath() . '.part'] as $path) {
            if (file_exists($path) && ! unlink($path)) {
                throw new \RuntimeException("could not clear the database staged at {$path}");
            }
        }
        SyncStorage::discardStaged();
        // A rebase set aside for an earlier stage never replays on this one,
        // and a homecoming never tells of a pull this stage replaced.
        RebasePending::clear();
        HomecomingSince::clear();
    }
}
