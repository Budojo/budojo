<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * The hashes of the files stored before rows recorded them (#2030 part 2),
 * read once from disk. A file that is not there leaves its row without one:
 * nothing can be sent that this device does not have.
 *
 * Query builder, not models: a data migration must keep meaning what it
 * meant on the day it ran, whatever the models become.
 */
return new class extends Migration
{
    /** @var list<array{string, string, string, string}> table, path column, hash column, disk */
    private const array FILES = [
        ['documents', 'file_path', 'file_sha256', 'local'],
        ['athletes', 'photo_path', 'photo_sha256', 'public'],
        ['users', 'avatar_path', 'avatar_sha256', 'public'],
        ['academies', 'logo_path', 'logo_sha256', 'public'],
    ];

    public function up(): void
    {
        foreach (self::FILES as [$table, $pathColumn, $hashColumn, $disk]) {
            $storage = Storage::disk($disk);
            $rows = DB::table($table)->whereNotNull($pathColumn)->whereNull($hashColumn)->get(['id', $pathColumn]);
            foreach ($rows as $row) {
                $path = $row->{$pathColumn};
                if (! \is_string($path) || ! $storage->exists($path)) {
                    continue;
                }
                $hash = hash_file('sha256', $storage->path($path));
                if ($hash !== false) {
                    DB::table($table)->where('id', $row->id)->update([$hashColumn => $hash]);
                }
            }
        }
    }

    public function down(): void
    {
        // The hashes go with their columns, in the migration before this one.
    }
};
