<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Support\Sync\IncomingDatabase;
use App\Support\Sync\IncomingFile;
use App\Support\Sync\SyncDatabase;
use App\Support\Sync\SyncFiles;

/**
 * The contents another database names (#2118): a version's, which the app
 * reads to delete from the folder's `files/` what no kept version names. The
 * same rules as `GET /sync/files`, read from the database it is given and
 * never from this device's own.
 *
 * A database it cannot read for certain is refused, and the app then deletes
 * nothing: one that is not Budojo's or is damaged, one from a later Budojo,
 * whose rows may name files in a way this code does not know, and one older
 * than the content hashes, whose rows name no content at all.
 */
final class ListNamedContentsAction
{
    /**
     * @param  resource  $body  the database's bytes, as they arrive
     * @return list<string>
     */
    public function execute($body): array
    {
        $incoming = tempnam(sys_get_temp_dir(), 'budojo-named-');
        if ($incoming === false) {
            throw new \RuntimeException('no temporary file for the incoming database');
        }

        try {
            IncomingFile::receive($body, $incoming);
            IncomingDatabase::check($incoming);
            if (! \in_array(SyncFiles::HASHED_SINCE, SyncDatabase::appliedMigrations($incoming) ?? [], true)) {
                throw StageRefused::unreadable('The database is older than the sync’s files: its rows name no content.');
            }

            return SyncFiles::namedIn($incoming);
        } finally {
            // A database in WAL mode leaves `-wal` and `-shm` beside the copy, read only too.
            foreach (['', '-wal', '-shm'] as $suffix) {
                @unlink($incoming . $suffix);
            }
        }
    }
}
