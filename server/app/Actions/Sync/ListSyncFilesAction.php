<?php

declare(strict_types=1);

namespace App\Actions\Sync;

use App\Support\Sync\NamedFile;
use App\Support\Sync\SyncFiles;

/**
 * The contents the database names, once each, and whether this device holds
 * them (#2030 part 2). The app sends the ones it holds and Drive lacks, and
 * fetches the ones it lacks. Several rows may name one content (the same
 * picture for two athletes); it travels once.
 */
final class ListSyncFilesAction
{
    /** @return list<array{sha256: string, size: int|null, present: bool}> */
    public function execute(): array
    {
        $byContent = [];
        foreach (SyncFiles::named() as $file) {
            $byContent[$file->sha256][] = $file;
        }
        ksort($byContent);

        $listed = [];
        foreach ($byContent as $sha256 => $files) {
            $held = $this->held($files);
            $size = $held === null ? false : filesize($held->absolutePath());
            $listed[] = [
                'sha256' => (string) $sha256,
                'size' => $size === false ? null : $size,
                'present' => $held !== null,
            ];
        }

        return $listed;
    }

    /** @param list<NamedFile> $files */
    private function held(array $files): ?NamedFile
    {
        foreach ($files as $file) {
            if ($file->isPresent()) {
                return $file;
            }
        }

        return null;
    }
}
