<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Support\Sync\SyncDatabase;

/**
 * A snapshot of the database for a version (#2030), taken the way the backups
 * take theirs: `VACUUM INTO`, SQLite's own consistent copy, safe while the app
 * keeps writing. A file copy of a database in WAL mode is not.
 */
final class ExportDatabaseAction
{
    public function execute(): ExportedDatabase
    {
        // An empty file is what `VACUUM INTO` accepts besides none at all.
        $snapshot = tempnam(sys_get_temp_dir(), 'budojo-export-');
        if ($snapshot === false) {
            throw new \RuntimeException('no temporary file for the snapshot');
        }

        try {
            $pdo = SyncDatabase::open(SyncDatabase::path());
            $pdo->exec('VACUUM INTO ' . $pdo->quote($snapshot));
            $schema = SyncDatabase::schemaOf($snapshot)
                ?? throw new \RuntimeException('the database has no migrations');
        } catch (\Throwable $error) {
            @unlink($snapshot);

            throw $error;
        }

        return new ExportedDatabase($snapshot, $schema);
    }
}
