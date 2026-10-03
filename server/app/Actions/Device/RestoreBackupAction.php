<?php

declare(strict_types=1);

namespace App\Actions\Device;

use App\Actions\Sync\StageDatabaseAction;
use App\Support\Backup\BackupArchive;
use App\Support\Sync\Homecoming;
use App\Support\Sync\Staged;
use App\Support\Sync\SyncStorage;

/**
 * Stages a backup the PC took, for the shell to swap in at its next start
 * (#2079): its database beside the live one, as a sync stages a version
 * (#2030), and its files beside `storage/app`. Nothing is staged until the
 * archive and its database have passed every check.
 *
 * **The files go first, and the database commits** (`Staged`): the shell
 * swaps a staged storage only beside a staged database. A restore cut short
 * leaves at most a staged storage alone, which the shell deletes.
 */
final class RestoreBackupAction
{
    public function __construct(private readonly StageDatabaseAction $stage)
    {
    }

    /** @param resource $body the archive's bytes, as they arrive */
    public function execute($body): void
    {
        // Every check first (the manifest, every name in the archive, the
        // database): a refused backup leaves whatever was staged as it was.
        $archive = BackupArchive::receive($body);
        $database = $archive->database();

        Staged::clear();
        $part = SyncStorage::stagedPath() . '.part';

        try {
            if (! mkdir($part, 0o775, true) && ! is_dir($part)) {
                throw new \RuntimeException('could not make a folder for the staged files');
            }
            $archive->extractFiles($part);
            if (! rename($part, SyncStorage::stagedPath())) {
                throw new \RuntimeException('could not stage the files beside the live ones');
            }
            $this->stage->stageChecked($database);
            // The homecoming told of the database the restore replaces
            // (#2039): forgotten once the restore is staged, never before
            // (a restore that fails keeps the live database and its news).
            Homecoming::forget();
        } catch (\Throwable $e) {
            Staged::clear();

            throw $e;
        }
    }
}
