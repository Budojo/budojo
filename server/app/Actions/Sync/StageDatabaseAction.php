<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Support\Sync\IncomingDatabase;
use App\Support\Sync\IncomingFile;
use App\Support\Sync\Staged;
use App\Support\Sync\SyncDatabase;

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
            IncomingDatabase::check($incoming);
            // Only once it passed: a refused version leaves whatever was
            // staged as it was. A version carries no files, so the files an
            // earlier restore staged go with its database (#2079).
            Staged::clear();
            $this->stageChecked($incoming);
        } finally {
            @unlink($incoming);
        }
    }

    /**
     * A database that has passed `IncomingDatabase::check`, copied beside the
     * live file, then renamed: a rename within one directory is atomic, so the
     * shell never finds half a staged file. It is the last thing a stage
     * writes, since a staged database is what commits one.
     */
    public function stageChecked(string $incoming): void
    {
        $staged = SyncDatabase::stagedPath();
        $part = "{$staged}.part";
        if (! copy($incoming, $part) || ! rename($part, $staged)) {
            @unlink($part);

            throw new \RuntimeException('could not stage the database beside the live one');
        }
    }
}
