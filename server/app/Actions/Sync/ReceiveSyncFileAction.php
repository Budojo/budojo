<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Support\Sync\SyncFiles;
use Illuminate\Support\Facades\Storage;

/**
 * Another device's file, written where this database names its content
 * (#2030 part 2). The bytes must be the content named: a file is trusted by
 * its hash, not by who sent it. Every row naming it gets it, including a path
 * that held something else on this device: photos are named by id, and the
 * other device's athlete 57 is not this one's.
 */
final class ReceiveSyncFileAction
{
    public function execute(string $sha256, string $bytes): void
    {
        $naming = SyncFiles::naming($sha256);
        if ($naming === []) {
            throw SyncFileRefused::unknown($sha256);
        }
        if (hash('sha256', $bytes) !== $sha256) {
            throw SyncFileRefused::mismatch($sha256);
        }

        foreach ($naming as $file) {
            if (! $file->isPresent() && ! Storage::disk($file->disk)->put($file->path, $bytes)) {
                throw new \RuntimeException("could not write {$file->path}");
            }
        }
    }
}
