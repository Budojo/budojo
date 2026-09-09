<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Which month the academy's training year begins in (#1484).
     *
     * Stored as a month rather than a date, because a season is a recurring
     * boundary, not an event: "we start again in September" stays true every
     * year, and a date would need rewriting each August.
     *
     * Nullable with a September default applied in the app rather than the
     * column, so an academy that has never opened its settings still gets a
     * sensible year without the schema claiming they chose it.
     */
    public function up(): void
    {
        Schema::table('academies', function (Blueprint $table): void {
            // 1-12. Unsigned tinyint rather than an enum: the set is closed
            // and numeric, and the app already reads months as integers.
            $table->unsignedTinyInteger('season_start_month')->nullable()->after('training_days');
        });
    }

    public function down(): void
    {
        Schema::table('academies', function (Blueprint $table): void {
            $table->dropColumn('season_start_month');
        });
    }
};
