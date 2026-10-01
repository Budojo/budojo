<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Support\Sync\SyncDatabase;

/**
 * Puts another device's database beside the live one, for the shell to swap in
 * at its next start (#2030, PRD § 5.2). Nothing is staged until the file has
 * passed every check, so a bad download can never become the next database.
 *
 * The checks are a restore's: a SQLite file, undamaged, with Budojo's
 * migrations, and **no newer than this code** (PRD § 5.5). An older one is
 * fine: the boot migrations bring it forward, as they do a restored backup.
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
            // Streamed to disk, never held whole in memory: a database is megabytes.
            $target = fopen($incoming, 'wb');
            if ($target === false || stream_copy_to_stream($body, $target) === false) {
                throw new \RuntimeException('could not receive the incoming database');
            }
            fclose($target);

            $this->stage($incoming);
        } finally {
            @unlink($incoming);
        }
    }

    private function stage(string $incoming): void
    {
        if (file_get_contents($incoming, false, null, 0, \strlen(SyncDatabase::HEADER)) !== SyncDatabase::HEADER) {
            throw StageRefused::unreadable('This is not a SQLite database.');
        }

        try {
            $check = SyncDatabase::scalar(SyncDatabase::open($incoming, readOnly: true), 'PRAGMA quick_check');
        } catch (\PDOException) {
            $check = false;
        }
        if ($check !== 'ok') {
            throw StageRefused::unreadable('The database is damaged.');
        }

        $schema = SyncDatabase::schemaOf($incoming)
            ?? throw StageRefused::unreadable('This is not a Budojo database: it has no migrations.');
        if (strcmp($schema, SyncDatabase::codeSchema()) > 0) {
            throw StageRefused::newer($schema);
        }

        // Copied beside the live file, then renamed: a rename within one
        // directory is atomic, so the shell never finds half a staged file.
        $staged = SyncDatabase::stagedPath();
        $part = "{$staged}.part";
        if (! copy($incoming, $part) || ! rename($part, $staged)) {
            @unlink($part);

            throw new \RuntimeException('could not stage the database beside the live one');
        }
    }
}
