<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Which lesson a presence belongs to (#1562).
     *
     * Nullable, with no backfill. Every row that predates the timetable stays
     * a presence on a day — which is all it ever was — and renders exactly as
     * it did. Guessing which class somebody attended eight months ago would be
     * inventing history to make a chart look fuller.
     *
     * Null on delete rather than cascade: removing a lesson must never remove
     * the people who were there.
     */
    public function up(): void
    {
        Schema::table('attendance_records', function (Blueprint $table): void {
            $table->foreignId('lesson_id')->nullable()->after('athlete_id')
                ->constrained()->nullOnDelete();
            // MySQL indexes a foreign key on its own; SQLite, which is what
            // the desktop ships, does not. "Who was at this lesson" is the
            // question this column exists to answer.
            $table->index(['lesson_id']);
        });
    }

    public function down(): void
    {
        Schema::table('attendance_records', function (Blueprint $table): void {
            $table->dropForeign(['lesson_id']);
            $table->dropIndex(['lesson_id']);
            $table->dropColumn('lesson_id');
        });
    }
};
