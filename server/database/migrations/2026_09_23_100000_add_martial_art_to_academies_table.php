<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What the academy teaches (#1800).
 *
 * The default is for the rows that already exist — every academy before this
 * column taught BJJ — and for a backup taken before it, which the desktop
 * migrates at boot. It is not an answer to a request: `POST /academy` requires
 * the field, so a new academy always says what it is.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('academies', function (Blueprint $table): void {
            $table->string('martial_art', 16)->default('bjj');
        });
    }

    public function down(): void
    {
        Schema::table('academies', function (Blueprint $table): void {
            $table->dropColumn('martial_art');
        });
    }
};
