<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * From which grade a topic belongs to the programme (#1861).
 *
 * A `Belt` value from the academy's ladder, or null for everyone — which is
 * what every existing topic is, so nothing is backfilled. The ladder is the
 * martial art's and lives in code, so the column cannot carry a foreign key;
 * the requests validate it against the ladder instead.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('syllabus_topics', function (Blueprint $table): void {
            $table->string('from_belt', 20)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('syllabus_topics', function (Blueprint $table): void {
            $table->dropColumn('from_belt');
        });
    }
};
