<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `users.avatar_path` (#411). Stores the relative path of the user's
 * uploaded avatar on the `public` disk. Nullable — most users sit on
 * their initials placeholder, the file only exists after an explicit
 * upload. Mirrors `academies.logo_path` (the same shape was already
 * proven on the academy-logo flow).
 *
 * No index — the column is read on the user's own row only, never
 * filtered or joined on.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('avatar_path')->nullable()->after('terms_accepted_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('avatar_path');
        });
    }
};
