<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * How long a lesson actually ran (#1591).
 *
 * Mat hours were `sessions × 1.5`, a flat constant from the M4 PRD that no
 * timetable input could move: an academy whose classes are an hour long still
 * read 4.5h for three sessions, and would have gone on doing so for every
 * future session too. `academy_classes.duration_minutes` has held the real
 * number for a while; nothing was wired to it.
 *
 * The column lives on the **lesson**, not read live through the class, for the
 * same reason `name`, `starts_at` and `kind` are already copied there by
 * `MaterialiseLessonAction`: the timetable is mutable and the past is not.
 * Reading it live would rewrite last March's hours the day somebody shortens
 * their Monday class.
 *
 * Nullable, and it stays nullable. A lesson whose class never set a duration
 * has no honest number to copy, and the readers fall back to ninety minutes
 * there rather than storing a guess that later looks like a measurement.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Guarded so the data half below can be exercised on a schema that
        // already has the column — which is how the test reaches it, and the
        // data half is the half that can silently do nothing.
        if (! Schema::hasColumn('lessons', 'duration_minutes')) {
            Schema::table('lessons', function (Blueprint $table): void {
                $table->unsignedSmallInteger('duration_minutes')->nullable()->after('starts_at');
            });
        }

        // Existing lessons take the duration their class carries today. It is
        // the best evidence available for a session already taught, and it is
        // what the owner would answer if asked. From here on the snapshot is
        // taken when the lesson is created, so this is the only time the value
        // is read back out of the timetable.
        DB::table('lessons')
            ->whereNull('duration_minutes')
            ->whereNotNull('academy_class_id')
            ->update([
                'duration_minutes' => DB::raw(
                    '(SELECT ac.duration_minutes FROM academy_classes ac WHERE ac.id = lessons.academy_class_id)',
                ),
            ]);
    }

    public function down(): void
    {
        Schema::table('lessons', function (Blueprint $table): void {
            $table->dropColumn('duration_minutes');
        });
    }
};
