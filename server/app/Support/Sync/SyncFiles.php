<?php

declare(strict_types=1);

namespace App\Support\Sync;

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\Document;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * Every file the database names, with the content each row expects (#2030
 * part 2): documents on the private disk, and athletes' photos, avatars and
 * the academy's logo on the public one. The same four `ReconcileFilesAction`
 * keeps, so what the sync carries and what the reconcile spares agree.
 */
final class SyncFiles
{
    /** The migration from which every row naming a file records its content: an older database names none. */
    public const string HASHED_SINCE = '2026_10_02_000001_fill_content_sha256_for_sync';

    /**
     * @param  string|null  $connection  another database's (#2118); this device's own when null
     * @return list<NamedFile>
     */
    public static function named(?string $connection = null): array
    {
        return [
            ...self::from(Document::on($connection), 'file_path', 'file_sha256', 'local'),
            ...self::from(Athlete::on($connection)->withTrashed(), 'photo_path', 'photo_sha256', 'public'),
            ...self::from(User::on($connection), 'avatar_path', 'avatar_sha256', 'public'),
            ...self::from(Academy::on($connection), 'logo_path', 'logo_sha256', 'public'),
        ];
    }

    /**
     * The contents a database file names (#2118): a version's, which the app
     * reads to know what the folder must keep. By the same rules as this
     * device's own, through a read-only connection of its own that is gone
     * again before this returns.
     *
     * @return list<string> each content once, sorted
     */
    public static function namedIn(string $path): array
    {
        $connection = 'sync_named';
        config()->set("database.connections.{$connection}", [
            'driver' => 'sqlite',
            'database' => $path,
            'prefix' => '',
            'options' => [\PDO::SQLITE_ATTR_OPEN_FLAGS => \PDO::SQLITE_OPEN_READONLY],
        ]);

        try {
            $contents = array_values(array_unique(array_map(
                static fn (NamedFile $file): string => $file->sha256,
                self::named($connection),
            )));
        } finally {
            // Closed before the caller deletes the file: Windows cannot delete an open one.
            DB::purge($connection);
            config()->set("database.connections.{$connection}", null);
        }
        sort($contents);

        return $contents;
    }

    /** @return list<NamedFile> the rows naming this content */
    public static function naming(string $sha256): array
    {
        return array_values(array_filter(
            self::named(),
            static fn (NamedFile $file): bool => $file->sha256 === $sha256,
        ));
    }

    /**
     * @template TModel of Model
     *
     * @param  Builder<TModel>  $query
     * @return list<NamedFile>
     */
    private static function from(Builder $query, string $pathColumn, string $hashColumn, string $disk): array
    {
        $files = [];
        foreach ($query->whereNotNull($pathColumn)->whereNotNull($hashColumn)->toBase()->get([$pathColumn, $hashColumn]) as $row) {
            $path = $row->{$pathColumn};
            $hash = $row->{$hashColumn};
            if (\is_string($path) && \is_string($hash)) {
                $files[] = new NamedFile($hash, $disk, $path);
            }
        }

        return $files;
    }
}
