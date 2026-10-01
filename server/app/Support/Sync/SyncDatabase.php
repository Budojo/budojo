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

    public static function open(string $path, bool $readOnly = false): \PDO
    {
        $options = [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION];
        if ($readOnly) {
            $options[\PDO::SQLITE_ATTR_OPEN_FLAGS] = \PDO::SQLITE_OPEN_READONLY;
        }

        return new \PDO("sqlite:{$path}", null, null, $options);
    }

    /**
     * The newest migration a database file has run: the schema it was written
     * with (PRD § 5.5). Null for a file with no migrations, which is not a
     * Budojo database.
     */
    public static function schemaOf(string $path): ?string
    {
        try {
            $newest = self::scalar(self::open($path, readOnly: true), 'select max(migration) from migrations');
        } catch (\PDOException) {
            return null;
        }

        return \is_string($newest) && $newest !== '' ? $newest : null;
    }

    /** The first column of the first row a query returns. */
    public static function scalar(\PDO $pdo, string $sql): mixed
    {
        $statement = $pdo->query($sql);

        return $statement === false ? null : $statement->fetchColumn();
    }

    /**
     * The newest migration this code carries. A database newer than this is
     * from a later Budojo, whose columns this code does not know.
     */
    public static function codeSchema(): string
    {
        /** @var array<string, string> $files */
        $files = app('migrator')->getMigrationFiles(database_path('migrations'));
        $names = array_keys($files);
        sort($names);

        return (string) end($names);
    }
}
