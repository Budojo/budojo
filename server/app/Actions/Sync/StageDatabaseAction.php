<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Support\Sync\IncomingDatabase;
use App\Support\Sync\IncomingFile;
use App\Support\Sync\SyncDatabase;
use App\Support\Sync\SyncStorage;

/**
 * Puts another device's database beside the live one, for the shell to swap in
 * at its next start (#2030, PRD § 5.2). Nothing is staged until the file has
 * passed every check (`IncomingDatabase`), so a bad download can never become
 * the next database.
 */
final class StageDatabaseAction
{
    /** @param resource $body the database's bytes, as they arrive */
    public function execute($body): void
    {
        $incoming = tempnam(sys_get_temp_dir(), 'budojo-stage-');
        if ($incoming === false) {
            throw new \RuntimeException('no temporary file for the incoming database');
        }

        try {
            IncomingFile::receive($body, $incoming);
            // A version carries no files: a storage an abandoned restore
            // staged must not come in beside it (#2079).
            SyncStorage::discardStaged();
            $this->stageFile($incoming);
        } finally {
            @unlink($incoming);
        }
    }

    /** A database already on disk, checked, then staged. */
    public function stageFile(string $incoming): void
    {
        IncomingDatabase::check($incoming);
        $this->stage($incoming);
    }

    /**
     * Copied beside the live file, then renamed: a rename within one directory
     * is atomic, so the shell never finds half a staged file.
     */
    private function stage(string $incoming): void
    {
        $staged = SyncDatabase::stagedPath();
        $part = "{$staged}.part";
        if (! copy($incoming, $part) || ! rename($part, $staged)) {
            @unlink($part);

            throw new \RuntimeException('could not stage the database beside the live one');
        }
    }
}
