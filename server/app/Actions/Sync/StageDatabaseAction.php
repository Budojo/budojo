<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Support\Sync\SyncDatabase;

/**
 * Puts another device's database beside the live one, for the shell to swap in
 * at its next start (#2030, PRD § 5.2). Nothing is staged until the file has
 * passed every check, so a bad download can never become the next database.
 *
 * The checks are a restore's, and a little more, because a staged file becomes
 * the whole academy:
 * - a SQLite file, undamaged;
 * - **Budojo's history:** it has run Budojo's own migrations (another app's
 *   database has not), and only migrations this code carries: one it lacks is
 *   from a later Budojo (`newer`, PRD § 5.5).
 *
 * An older database is fine: the boot migrations bring it forward, as they do a
 * restored backup.
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
            $this->receive($body, $incoming);
            $this->check($incoming);
            $this->stage($incoming);
        } finally {
            @unlink($incoming);
        }
    }

    /**
     * Streamed to disk, never held whole in memory: a database is megabytes.
     *
     * @param resource $body
     */
    private function receive($body, string $incoming): void
    {
        $target = fopen($incoming, 'wb');
        if ($target === false) {
            throw new \RuntimeException('could not open a file for the incoming database');
        }

        try {
            if (stream_copy_to_stream($body, $target) === false) {
                throw new \RuntimeException('could not receive the incoming database');
            }
        } finally {
            // Closed before anything deletes it: Windows cannot delete an open file.
            fclose($target);
        }
    }

    private function check(string $incoming): void
    {
        if (file_get_contents($incoming, false, null, 0, \strlen(SyncDatabase::HEADER)) !== SyncDatabase::HEADER) {
            throw StageRefused::unreadable('This is not a SQLite database.');
        }

        try {
            $integrity = SyncDatabase::scalar(SyncDatabase::openReadOnly($incoming), 'PRAGMA quick_check');
        } catch (\PDOException) {
            $integrity = false;
        }
        if ($integrity !== 'ok') {
            throw StageRefused::unreadable('The database is damaged.');
        }

        $applied = SyncDatabase::appliedMigrations($incoming);
        if ($applied === null || ! \in_array(SyncDatabase::BUDOJO_MIGRATION, $applied, true)) {
            throw StageRefused::unreadable('This is not a Budojo database.');
        }

        // A Budojo database that has run a migration this code lacks is from a
        // later Budojo, whatever the migration's date: a branch can ship one
        // dated before a migration already out. Update first.
        $unknown = array_values(array_diff($applied, SyncDatabase::codeMigrations()));
        if ($unknown !== []) {
            throw StageRefused::newer($unknown[0]);
        }
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
