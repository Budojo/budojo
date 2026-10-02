<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Support\Sync\NamedFile;
use App\Support\Sync\SyncFiles;

/**
 * The contents the database names, once each, and whether this device holds
 * them (#2030 part 2). Several rows may name one content (the same picture
 * for two athletes); it travels once.
 *
 * - `present`: held at one of its paths, so the app can send it.
 * - `complete`: held at every path naming it, so nothing is left to write.
 *   A content can be present and not complete: the phone held this PDF for
 *   one athlete, and the PC's version names it for a second.
 */
final class ListSyncFilesAction
{
    /** @return list<array{sha256: string, size: int|null, present: bool, complete: bool}> */
    public function execute(): array
    {
        $byContent = [];
        foreach (SyncFiles::named() as $file) {
            $byContent[$file->sha256][] = $file;
        }
        ksort($byContent);

        $listed = [];
        foreach ($byContent as $sha256 => $files) {
            $held = array_values(array_filter($files, static fn (NamedFile $file): bool => $file->isPresent()));
            $size = $held === [] ? false : filesize($held[0]->absolutePath());
            $listed[] = [
                'sha256' => (string) $sha256,
                'size' => $size === false ? null : $size,
                'present' => $held !== [],
                'complete' => \count($held) === \count($files),
            ];
        }

        return $listed;
    }
}
