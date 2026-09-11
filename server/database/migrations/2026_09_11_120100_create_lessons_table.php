<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One real occurrence of a class on one date (#1562).
     *
     * This is the row attendance points at and the row topics will attach to
     * (#1564). It is created lazily — the first time somebody checks in, or
     * later plans a lesson — never ahead of time: pre-creating a year for
     * four weekly classes would be two hundred rows per academy asserting
     * something happened when it did not.
     *
     * `name`, `starts_at` and `kind` are copied from the class at creation
     * and never re-read from it. The timetable is mutable and the past is
     * not: moving Tuesday fundamentals to Wednesday must not rewrite what
     * happened on every previous Tuesday. `academy_schedules` (#1094) solved
     * the same problem with a history table; a lesson is an event, so it can
     * carry its own truth and skip the table.
     */
    public function up(): void
    {
        Schema::create('lessons', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('academy_id')->constrained()->cascadeOnDelete();
            // Nullable, and null on delete: a class removed from the
            // timetable leaves the lessons it produced standing, under the
            // name they were held as. Deleting a class must not delete the
            // evenings people trained.
            $table->foreignId('academy_class_id')->nullable()
                ->constrained('academy_classes')->nullOnDelete();
            $table->date('held_on');
            $table->string('name', 60);
            $table->string('starts_at', 5)->nullable();
            $table->string('kind', 8);
            $table->text('notes')->nullable();
            $table->timestamps();

            // One occurrence per class per day. Two instructors tapping two
            // athletes at the same second must land on the same lesson, and
            // this is what makes the second insert fail instead of forking
            // the evening in two.
            $table->unique(['academy_class_id', 'held_on']);
            $table->index(['academy_id', 'held_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lessons');
    }
};
