<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance_records', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('athlete_id')->constrained()->cascadeOnDelete();
            $table->date('attended_on');
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->softDeletes();

            // Cross-athlete "who was here on this date?" — widget queries
            // the whole academy for a given day.
            $table->index('attended_on');

            // Per-athlete history windowed by date range — the calendar
            // view + monthly summary both pivot on athlete_id first.
            $table->index(['athlete_id', 'attended_on']);

            // Default Eloquent scans filter by deleted_at (SoftDeletes
            // global scope); composite helps the planner avoid a full
            // tablescan when excluding tombstones.
            $table->index(['athlete_id', 'deleted_at']);

            // Uniqueness of "one active record per (athlete, date)" is
            // enforced by MarkAttendanceAction at insertion time — MySQL 8
            // doesn't support partial unique indexes (WHERE deleted_at IS
            // NULL), so a full unique here would block the correct-a-
            // mistake-by-soft-delete-and-reinsert flow the PRD calls out.
            // Under the single-instructor-per-session constraint (PRD
            // non-goal #5) the app-level check is race-safe enough; a
            // future multi-instructor mode would want a virtual-column
            // workaround. See server/app/Actions/Attendance/
            // MarkAttendanceAction.php.
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_records');
    }
};
