<?php

declare(strict_types=1);

namespace App\Actions\Device;

use App\Actions\Sync\StageDatabaseAction;
use App\Support\Backup\BackupArchive;
use App\Support\Sync\SyncStorage;

/**
 * Stages a backup the PC took, for the shell to swap in at its next start
 * (#2079): its database beside the live one, as a sync stages a version
 * (#2030), and its files beside `storage/app`. Nothing is staged until the
 * archive and its database have passed every check.
 *
 * **The files go first, and the database commits:** the shell swaps a staged
 * storage only beside a staged database. A restore cut short between the two
 * leaves a staged storage alone, which the shell deletes, as does the next
 * stage.
 */
final class RestoreBackupAction
{
    public function __construct(private readonly StageDatabaseAction $stage)
    {
    }

    /** @param resource $body the archive's bytes, as they arrive */
    public function execute($body): void
    {
        $archive = BackupArchive::receive($body);
        $database = $archive->database();

        SyncStorage::discardStaged();
        $part = SyncStorage::stagedPath() . '.part';

        try {
            if (! mkdir($part, 0o775, true) && ! is_dir($part)) {
                throw new \RuntimeException('could not make a folder for the staged files');
            }
            $archive->extractFiles($part);
            if (! rename($part, SyncStorage::stagedPath())) {
                throw new \RuntimeException('could not stage the files beside the live ones');
            }
            $this->stage->stageFile($database);
        } catch (\Throwable $e) {
            SyncStorage::discardStaged();

            throw $e;
        }
    }
}
