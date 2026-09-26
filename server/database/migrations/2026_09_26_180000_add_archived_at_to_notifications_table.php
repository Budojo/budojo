<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An inbox the owner can tick things off (#1914): an archived notification
 * leaves "Da vedere" and is kept, not deleted, under "Archiviate".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('notifications', function (Blueprint $table): void {
            $table->timestamp('archived_at')->nullable()->after('read_at');
        });
    }

    public function down(): void
    {
        Schema::table('notifications', function (Blueprint $table): void {
            $table->dropColumn('archived_at');
        });
    }
};
