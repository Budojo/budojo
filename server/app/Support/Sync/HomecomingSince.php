<?php

declare(strict_types=1);

namespace App\Support\Sync;

/**
 * What this device held of the other device's work when it staged that
 * device's version (#2039): its `holds`, beside the live database as
 * `<database>.homecoming-since`. The reconcile reads it once the version is
 * swapped in, and tells the owner what arrived since (`RecordHomecomingAction`).
 *
 * **Written at the stage, because the swap replaces the database that knows
 * it,** as `RebasePending` is. Every stage clears it first (`Staged::clear`),
 * so a restore, which writes none, never tells of an older pull.
 */
final class HomecomingSince
{
    public static function path(): string
    {
        return SyncDatabase::path() . '.homecoming-since';
    }

    /**
     * Written beside and renamed, as a stage is.
     *
     * @param  array<string, string>  $holds  per device, the newest of its entries this database holds
     */
    public static function remember(array $holds): void
    {
        $path = self::path();
        $part = "{$path}.part";
        if (file_put_contents($part, json_encode(['v' => 1, 'holds' => (object) $holds], JSON_THROW_ON_ERROR)) === false || ! rename($part, $path)) {
            @unlink($part);

            throw new \RuntimeException('could not keep what this device held before the swap');
        }
    }

    /** @return array<string, string>|null null when no pull is waiting to be told */
    public static function read(): ?array
    {
        $path = self::path();
        if (! file_exists($path)) {
            return null;
        }
        $value = json_decode((string) file_get_contents($path), true);
        $holds = \is_array($value) ? ($value['holds'] ?? null) : null;
        if (! \is_array($holds)) {
            throw new \RuntimeException("what this device held, at {$path}, does not read");
        }

        /** @var array<string, string> $holds */
        return $holds;
    }

    public static function clear(): void
    {
        foreach ([self::path(), self::path() . '.part'] as $path) {
            if (file_exists($path) && ! unlink($path)) {
                throw new \RuntimeException("could not clear what this device held, at {$path}");
            }
        }
    }
}
