<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Support\Sync\Homecoming;
use App\Support\Sync\HomecomingSince;
use App\Support\Sync\IncomingDatabase;
use App\Support\Sync\IncomingFile;
use App\Support\Sync\RebasePending;
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
    /**
     * @param  resource  $body  the database's bytes, as they arrive
     * @param  bool  $rebase  replay this device's kept writes on it after the swap (#2031 step 3)
     * @param  array<string, string>|null  $since  what this device held of the other device's work, for the
     *                                             homecoming (#2039); null when a whole academy arrives
     */
    public function execute($body, bool $rebase = false, ?array $since = null): void
    {
        $incoming = tempnam(sys_get_temp_dir(), 'budojo-stage-');
        if ($incoming === false) {
            throw new \RuntimeException('no temporary file for the incoming database');
        }

        try {
            // A rebase replays this device's writes: refused with no device,
            // before anything already staged is touched.
            $device = $rebase ? self::rebasingDevice() : null;
            IncomingFile::receive($body, $incoming);
            IncomingDatabase::check($incoming);
            // Only once it passed: a refused version leaves whatever was
            // staged as it was. A version carries no files, so the files an
            // earlier restore staged go with its database (#2079).
            Staged::clear();
            // What this device held of the other's work, for the homecoming
            // (#2039): the swap replaces the database that knows it. A whole
            // academy arriving makes news of the one it replaces moot.
            if ($since !== null) {
                HomecomingSince::remember($since);
            } else {
                Homecoming::forget();
            }
            if ($device !== null) {
                // Before the database: a staged database is what commits a
                // stage, so it never exists without the writes to replay on it.
                RebasePending::setAside($device);
            }
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

    /** The device whose writes a rebase sets aside. */
    private static function rebasingDevice(): string
    {
        $device = config('budojo.sync.device');
        if (! \is_string($device) || $device === '') {
            throw new \RuntimeException('a rebase needs this device\'s id');
        }

        return $device;
    }
}
