<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `athletes.photo_path` (#1357). Relative path of the athlete's photo on the
 * `public` disk.
 *
 * Until now an athlete had no photo of its own — the picture in the list came
 * from a linked user account, and `athlete_accounts` is absent from the desktop
 * runtime, so on the shipped build an athlete could never have one at all.
 *
 * Nullable: most rows sit on the initials placeholder, and the file exists only
 * after an explicit upload. Mirrors `users.avatar_path` and
 * `academies.logo_path`, whose shape was already proven.
 *
 * No index — read on the athlete's own row, never filtered or joined on.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('athletes', function (Blueprint $table): void {
            $table->string('photo_path')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('athletes', function (Blueprint $table): void {
            $table->dropColumn('photo_path');
        });
    }
};
