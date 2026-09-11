<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The weekly timetable (#1562).
     *
     * Until now Budojo knew when an academy trains as a weekday bitmap —
     * "Mon/Wed/Fri" — and nothing more. An academy running kids at 17:00 and
     * adults at 19:00 on the same Monday had one undifferentiated bucket for
     * both, so "who was at the kids' class" could not be asked, and there was
     * nothing for a lesson's topics to attach to.
     *
     * One row here is one recurring slot: a name, a weekday, optionally a
     * clock time. It is mutable — the owner moves classes around — and the
     * past is protected by `lessons` snapshotting what it needs, not by a
     * history table.
     */
    public function up(): void
    {
        Schema::create('academy_classes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('academy_id')->constrained()->cascadeOnDelete();
            // The owner's own word for it — "Fundamentals", "Kids", "Open mat".
            $table->string('name', 60);
            // Carbon dayOfWeek, 0=Sun..6=Sat: the same convention as
            // `academy_schedules.training_days`, so the two never need
            // translating into each other.
            $table->unsignedTinyInteger('weekday');
            // `HH:MM` text rather than a TIME column. MySQL would hand back
            // `19:00:00`, SQLite whatever was written, and every reader would
            // then need to trim one and not the other. Zero-padded 24-hour
            // text sorts correctly as a string, which is all the timetable
            // asks of it. Nullable: an academy that does not run by the clock
            // still has a class, it just does not have a time.
            $table->string('starts_at', 5)->nullable();
            $table->unsignedSmallInteger('duration_minutes')->nullable();
            // App\Enums\ClassKind — gi / nogi / both / other.
            $table->string('kind', 8);
            $table->timestamps();

            // The hot read is "this academy's week", and the check-in narrows
            // it to one weekday.
            $table->index(['academy_id', 'weekday']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('academy_classes');
    }
};
