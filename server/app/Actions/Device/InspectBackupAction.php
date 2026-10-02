<?php

declare(strict_types=1);

namespace App\Actions\Device;

use App\Support\Backup\AcademySummary;
use App\Support\Backup\BackupArchive;
use App\Support\Sync\SyncDatabase;
use Illuminate\Support\Facades\DB;

/**
 * What a backup holds, beside what this device holds, before either is
 * replaced (#2079, PRD § 5.4): the door names both academies and the owner
 * chooses. Nothing is written.
 */
final class InspectBackupAction
{
    /**
     * @param  resource  $body  the archive's bytes, as they arrive
     * @return array{backup: array{taken_at: string, app_version: string, academy: array{name: string, athletes: int, belts: array<string, int>}|null}, here: array{name: string, athletes: int, belts: array<string, int>}|null}
     */
    public function execute($body): array
    {
        $archive = BackupArchive::receive($body);

        return [
            'backup' => [
                'taken_at' => $archive->manifest['createdAt'],
                'app_version' => $archive->manifest['appVersion'],
                'academy' => self::academyIn($archive->database()),
            ],
            'here' => AcademySummary::of(DB::connection()->getPdo()),
        ];
    }

    /**
     * Read through a connection that is closed when this returns, before the
     * archive deletes the file: Windows cannot delete an open one, and a copy
     * of the academy would stay in the temporary folder.
     *
     * @return array{name: string, athletes: int, belts: array<string, int>}|null
     */
    private static function academyIn(string $database): ?array
    {
        return AcademySummary::of(SyncDatabase::openReadOnly($database));
    }
}
