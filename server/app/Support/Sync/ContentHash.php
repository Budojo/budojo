<?php

declare(strict_types=1);

namespace App\Support\Sync;

use Illuminate\Support\Facades\Storage;

/**
 * The SHA-256 of a stored file's bytes, as rows record it for the sync
 * (#2030 part 2): the content a row expects, whatever its path is called on
 * this device.
 */
final class ContentHash
{
    /** Null when the file is not there. */
    public static function of(string $disk, string $path): ?string
    {
        $storage = Storage::disk($disk);
        if (! $storage->exists($path)) {
            return null;
        }
        $hash = hash_file('sha256', $storage->path($path));

        return $hash === false ? null : $hash;
    }
}
