<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The content each row's file holds, as its SHA-256 (#2030 part 2): the sync
 * carries a file once, named by its content, and the device that receives a
 * database matches every row to its file by this hash. Never by the path:
 * photos are named by the athlete's id, and ids diverge between two devices.
 *
 * Nullable: a row with no file has no hash, and one whose file is missing
 * keeps none until a device that has the file sends it.
 */
return new class extends Migration
{
    /** @var array<string, string> table => the column beside its path */
    private const array COLUMNS = [
        'documents' => 'file_sha256',
        'athletes' => 'photo_sha256',
        'users' => 'avatar_sha256',
        'academies' => 'logo_sha256',
    ];

    public function up(): void
    {
        foreach (self::COLUMNS as $table => $column) {
            Schema::table($table, function (Blueprint $blueprint) use ($column): void {
                $blueprint->char($column, 64)->nullable();
            });
        }
    }

    public function down(): void
    {
        foreach (self::COLUMNS as $table => $column) {
            Schema::table($table, function (Blueprint $blueprint) use ($column): void {
                $blueprint->dropColumn($column);
            });
        }
    }
};
