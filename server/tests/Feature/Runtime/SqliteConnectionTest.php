<?php

declare(strict_types=1);

use Illuminate\Support\Facades\DB;

/**
 * SQLite runtime guarantees (#1220).
 *
 * The PEST suite has always run on SQLite, but on `:memory:` with
 * RefreshDatabase — which hides everything that only matters for a database
 * file that outlives the process. The desktop app (#1218) keeps one file for
 * years, so the settings below stop being cosmetic:
 *
 *  - foreign keys are OFF by default in SQLite. Without the pragma a cascade
 *    delete leaves orphans instead of failing, and nothing complains.
 *  - WAL lets the 60s scheduler tick read while the UI writes, instead of
 *    the two blocking each other.
 *  - a busy timeout turns a momentary lock collision into a short wait
 *    rather than an immediate "database is locked" error surfaced to the user.
 */
it('enforces foreign keys on the active connection', function (): void {
    $enabled = DB::selectOne('PRAGMA foreign_keys');

    expect((int) ($enabled->foreign_keys ?? 0))->toBe(1);
});

it('rejects a row whose foreign key points nowhere', function (): void {
    // Proves the pragma is doing real work rather than merely being reported.
    expect(fn () => DB::table('athletes')->insert([
        'academy_id' => 999_999,
        'first_name' => 'Orphan',
        'last_name' => 'Row',
        'belt' => 'white',
        'status' => 'active',
        'created_at' => now(),
        'updated_at' => now(),
    ]))->toThrow(Illuminate\Database\QueryException::class);
});

it('applies WAL, synchronous and busy-timeout to a file database', function (): void {
    // Must be a real file: an in-memory database always reports journal_mode
    // "memory" no matter what is configured, so asserting WAL there would be
    // testing nothing.
    $path = sys_get_temp_dir() . '/budojo_pragma_probe_' . uniqid() . '.sqlite';
    touch($path);

    config()->set('database.connections.sqlite_probe', array_merge(
        config('database.connections.sqlite'),
        ['database' => $path],
    ));

    try {
        $connection = DB::connection('sqlite_probe');

        expect(strtolower((string) $connection->selectOne('PRAGMA journal_mode')->journal_mode))->toBe('wal')
            ->and((int) $connection->selectOne('PRAGMA synchronous')->synchronous)->toBe(1)
            ->and((int) $connection->selectOne('PRAGMA busy_timeout')->timeout)->toBe(5000);
    } finally {
        DB::purge('sqlite_probe');
        foreach ([$path, $path . '-wal', $path . '-shm'] as $file) {
            if (file_exists($file)) {
                unlink($file);
            }
        }
    }
});
