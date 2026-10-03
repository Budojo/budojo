<?php

declare(strict_types=1);

namespace App\Support\Sync;

use Illuminate\Support\Facades\DB;

/**
 * A rebase waiting for its replay (#2031 step 3): this device's kept journal,
 * set aside when the other device's database is staged, and replayed on it by
 * the reconcile once the shell has swapped it in. Beside the live database as
 * `<database>.rebase`.
 *
 * **Set aside at the stage, not after the swap,** because the journal lives in
 * the database the swap replaces: the swapped-in one keeps only this device's
 * rows of its own (`KeepOwnJournalAction`), which are not these. And the page
 * holds its writes from the stage to the swap (`holdWrites`), so nothing is
 * written in between that the file would miss.
 *
 * Every stage clears it first (`Staged::clear`): a stage that is not a rebase
 * (a fast-forward, a restore) must never replay an older one.
 */
final class RebasePending
{
    public static function path(): string
    {
        return SyncDatabase::path() . '.rebase';
    }

    /** Sets aside this device's kept entries, written beside and renamed, as a stage is. */
    public static function setAside(string $device): void
    {
        $entries = self::entriesOf($device);
        $path = self::path();
        $part = "{$path}.part";
        if (file_put_contents($part, json_encode(['v' => 1, 'device' => $device, 'entries' => $entries], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) === false || ! rename($part, $path)) {
            @unlink($part);

            throw new \RuntimeException('could not set this device\'s journal aside for the rebase');
        }
    }

    /**
     * A device's kept entries, as a replay takes them: oldest first, with
     * their JSON read.
     *
     * @return list<array{id: string, at: string, method: string, route: string, params: array<string, int|string>, body: array<string, mixed>|null, created: array<string, list<int|string>>, before: array<string, array<string, array<string, mixed>>>|null}>
     */
    public static function entriesOf(string $device): array
    {
        /** @var list<array{id: string, at: string, method: string, route: string, params: array<string, int|string>, body: array<string, mixed>|null, created: array<string, list<int|string>>, before: array<string, array<string, array<string, mixed>>>|null}> */
        return DB::table('sync_journal')->where('device', $device)->orderBy('id')->get()
            ->map(static fn (object $row): array => [
                'id' => (string) $row->id,
                'at' => (string) $row->at,
                'method' => (string) $row->method,
                'route' => (string) $row->route,
                'params' => self::decode($row->params) ?? [],
                'body' => self::decode($row->body),
                'created' => self::decode($row->created) ?? [],
                'before' => self::decode($row->before),
            ])
            ->values()
            ->all();
    }

    /**
     * @return array{device: string, entries: list<array{id: string, at: string, method: string, route: string, params: array<string, int|string>, body: array<string, mixed>|null, created: array<string, list<int|string>>, before: array<string, array<string, array<string, mixed>>>|null}>}|null
     */
    public static function read(): ?array
    {
        $path = self::path();
        if (! file_exists($path)) {
            return null;
        }
        $value = json_decode((string) file_get_contents($path), true);
        if (! \is_array($value) || ! \is_string($value['device'] ?? null) || ! \is_array($value['entries'] ?? null)) {
            throw new \RuntimeException("the rebase set aside at {$path} does not read");
        }

        /** @var array{device: string, entries: list<array{id: string, at: string, method: string, route: string, params: array<string, int|string>, body: array<string, mixed>|null, created: array<string, list<int|string>>, before: array<string, array<string, array<string, mixed>>>|null}>} $value */
        return $value;
    }

    public static function clear(): void
    {
        foreach ([self::path(), self::path() . '.part'] as $path) {
            if (file_exists($path) && ! unlink($path)) {
                throw new \RuntimeException("could not clear the rebase set aside at {$path}");
            }
        }
    }

    /** @return array<mixed>|null */
    private static function decode(mixed $json): ?array
    {
        if (! \is_string($json)) {
            return null;
        }
        $value = json_decode($json, true);

        return \is_array($value) ? $value : null;
    }
}
