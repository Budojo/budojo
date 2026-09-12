<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * What a lesson covered (#1564) — the join between the timetable and the
     * programme, and the row #1565 counts.
     *
     * No surrogate key and no timestamps: a link is the fact, it has no
     * identity of its own and nothing about it changes. The composite primary
     * key is also what makes attaching the same topic twice a no-op at the
     * schema level rather than a rule the code has to remember.
     *
     * The FK to `syllabus_topics` cascades on a **hard** delete only, which
     * is exactly right: topics are soft-deleted, so taking one out of the
     * programme leaves every lesson that taught it still able to say so.
     */
    public function up(): void
    {
        Schema::create('lesson_topic', function (Blueprint $table): void {
            $table->foreignId('lesson_id')->constrained()->cascadeOnDelete();
            $table->foreignId('syllabus_topic_id')->constrained()->cascadeOnDelete();

            $table->primary(['lesson_id', 'syllabus_topic_id']);
            // The reverse read — "which lessons covered this topic" — is what
            // the coverage view and the per-athlete gap view both ask (#1565,
            // #1567). The composite PK only indexes the other direction.
            $table->index('syllabus_topic_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('lesson_topic');
    }
};
