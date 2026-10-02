<?php

declare(strict_types=1);

namespace App\Support\Sync;

use Illuminate\Support\Facades\File;

/**
 * The files the academy keeps (`storage/app`: documents, photos, avatars, the
 * logo), and the copy a restore stages beside them for the shell to swap in
 * at its next start, together with the staged database (#2079).
 *
 * **The staged database is what commits a restore:** the storage is staged
 * first, and a staged storage with no staged database beside it is an
 * abandoned one, which the shell deletes and the next stage replaces.
 */
final class SyncStorage
{
    public static function path(): string
    {
        $configured = config('budojo.sync.storage');

        return \is_string($configured) && $configured !== '' ? $configured : storage_path('app');
    }

    public static function stagedPath(): string
    {
        return self::path() . '.staged';
    }

    public static function discardStaged(): void
    {
        foreach ([self::stagedPath(), self::stagedPath() . '.part'] as $dir) {
            if (is_dir($dir) && ! File::deleteDirectory($dir)) {
                throw new \RuntimeException("could not clear an earlier staged storage at {$dir}");
            }
        }
    }
}
