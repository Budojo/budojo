<?php

declare(strict_types=1);

namespace App\Support\Sync;

/**
 * The SQLite file the sync exports and stages beside (#2030), reached through
 * a connection of its own. `VACUUM INTO` cannot run inside the request's
 * transaction, and a file being checked must never become the app's database
 * by accident, so neither goes through the app's connection.
 */
final class SyncDatabase
{
    /** The first sixteen bytes of every SQLite 3 file. */
    public const string HEADER = "SQLite format 3\0";

    /**
     * Names Budojo's own history retired: a database that ran a migration
     * under one of them is not from a later Budojo. #443 renamed
     * `…120000_create_support_tickets_table` to `…120001_…`, so a database
     * that ran it before the rename (May 2026) keeps the old row for good.
     */
    public const array RETIRED_MIGRATIONS = ['2026_05_05_120000_create_support_tickets_table'];

    /** A migration only a Budojo database has run: another Laravel app's database lacks it. */
    public const string BUDOJO_MIGRATION = '2026_04_22_084344_create_academies_table';

    public static function path(): string
    {
        $configured = config('budojo.sync.database');
        if (\is_string($configured) && $configured !== '') {
            return $configured;
        }
        $default = config('database.connections.sqlite.database');

        return \is_string($default) ? $default : '';
    }

    /** The path the shell swaps in at its next start (#2030): beside the live file. */
    public static function stagedPath(): string
    {
        return self::path() . '.staged';
    }

    /**
     * The live database, read and written as it is, never created: a wrong
     * path fails rather than making an empty database the export would send.
     */
    public static function openExisting(string $path): \PDO
    {
        return self::connect($path, \PDO::SQLITE_OPEN_READWRITE);
    }

    /** A database to check: nothing it does can change it. */
    public static function openReadOnly(string $path): \PDO
    {
        return self::connect($path, \PDO::SQLITE_OPEN_READONLY);
    }

    /** The first column of the first row a query returns. */
    public static function scalar(\PDO $pdo, string $sql): mixed
    {
        $statement = $pdo->query($sql);

        return $statement === false ? null : $statement->fetchColumn();
    }

    /**
     * The migrations a database file has run, in order. Null when it has no
     * migrations table, which is not a Laravel database at all.
     *
     * @return list<string>|null
     */
    public static function appliedMigrations(string $path): ?array
    {
        try {
            $statement = self::openReadOnly($path)->query('select migration from migrations order by migration');
            $names = $statement === false ? [] : $statement->fetchAll(\PDO::FETCH_COLUMN);
        } catch (\PDOException) {
            return null;
        }

        return array_values(array_filter($names, \is_string(...)));
    }

    /** The newest migration a database has run: the schema it was written with (PRD § 5.5). */
    public static function schemaOf(string $path): ?string
    {
        $applied = self::appliedMigrations($path);

        return $applied === null || $applied === [] ? null : end($applied);
    }

    /**
     * The migrations this code carries, in order. A database that has run one
     * not among them is from a later Budojo, or is not Budojo's.
     *
     * @return list<string>
     */
    public static function codeMigrations(): array
    {
        /** @var array<string, string> $files */
        $files = app('migrator')->getMigrationFiles(database_path('migrations'));
        $names = array_keys($files);
        sort($names);

        return $names;
    }

    private static function connect(string $path, int $mode): \PDO
    {
        return new \PDO("sqlite:{$path}", null, null, [
            \PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION,
            \PDO::SQLITE_ATTR_OPEN_FLAGS => $mode,
        ]);
    }
}
