<?php

declare(strict_types=1);

namespace App\Support\Sync;

use App\Actions\Sync\StageRefused;

/**
 * The checks a database from elsewhere passes before it may become this
 * device's academy (#2030): another device's version, or a backup the PC
 * took (#2079). They are a restore's, and a little more:
 * - a SQLite file, undamaged;
 * - **Budojo's history:** it has run Budojo's own migrations (another app's
 *   database has not), and only migrations this code carries: one it lacks is
 *   from a later Budojo (`newer`, PRD § 5.5).
 *
 * An older database is fine: the boot migrations bring it forward, as they do a
 * restored backup.
 */
final class IncomingDatabase
{
    public static function check(string $path): void
    {
        if (file_get_contents($path, false, null, 0, \strlen(SyncDatabase::HEADER)) !== SyncDatabase::HEADER) {
            throw StageRefused::unreadable('This is not a SQLite database.');
        }

        try {
            $integrity = SyncDatabase::scalar(SyncDatabase::openReadOnly($path), 'PRAGMA quick_check');
        } catch (\PDOException) {
            $integrity = false;
        }
        if ($integrity !== 'ok') {
            throw StageRefused::unreadable('The database is damaged.');
        }

        $applied = SyncDatabase::appliedMigrations($path);
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
}
