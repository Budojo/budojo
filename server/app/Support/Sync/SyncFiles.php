<?php

declare(strict_types=1);

namespace App\Support\Sync;

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\Document;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * Every file the database names, with the content each row expects (#2030
 * part 2): documents on the private disk, and athletes' photos, avatars and
 * the academy's logo on the public one. The same four `ReconcileFilesAction`
 * keeps, so what the sync carries and what the reconcile spares agree.
 */
final class SyncFiles
{
    /** @return list<NamedFile> */
    public static function named(): array
    {
        return [
            ...self::from(Document::query(), 'file_path', 'file_sha256', 'local'),
            ...self::from(Athlete::withTrashed(), 'photo_path', 'photo_sha256', 'public'),
            ...self::from(User::query(), 'avatar_path', 'avatar_sha256', 'public'),
            ...self::from(Academy::query(), 'logo_path', 'logo_sha256', 'public'),
        ];
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
