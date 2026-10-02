<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Support\Sync\NamedFile;
use App\Support\Sync\SyncFiles;

/** A file of this device holding the content, for the app to send to Drive (#2030 part 2). */
final class FindSyncFileAction
{
    public function execute(string $sha256): NamedFile
    {
        $naming = SyncFiles::naming($sha256);
        if ($naming === []) {
            throw SyncFileRefused::unknown($sha256);
        }
        foreach ($naming as $file) {
            if ($file->isPresent()) {
                return $file;
            }
        }

        throw SyncFileRefused::missing($sha256);
    }
}
