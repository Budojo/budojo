<?php

declare(strict_types=1);

namespace App\Support\Sync;

/**
 * A request body written to disk as it arrives, never held whole in memory: a
 * database, or a backup archive, is megabytes.
 */
final class IncomingFile
{
    /** @param resource $body */
    public static function receive($body, string $path): void
    {
        $target = fopen($path, 'wb');
        if ($target === false) {
            throw new \RuntimeException('could not open a file for the incoming body');
        }

        try {
            if (stream_copy_to_stream($body, $target) === false) {
                throw new \RuntimeException('could not receive the incoming body');
            }
        } finally {
            // Closed before anything deletes it: Windows cannot delete an open file.
            fclose($target);
        }
    }
}
