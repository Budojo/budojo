<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-user current-academy pointer (#427 / #714, sub-issue 1/9).
 *
 * Persists "which academy am I currently looking at" on the user
 * record so it survives logout / login on the same device (PRD § 2 —
 * NOT per-session state). The next migration in this series backfills
 * the column for every user that owns an academy today.
 *
 * **`ON DELETE SET NULL`**: if the academy the user is currently
 * viewing gets deleted, the SPA degrades to the no-active-academy
 * state (which falls back to the user's first remaining membership,
 * if any). Better than `RESTRICT` which would block legitimate
 * academy deletes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->foreignId('active_academy_id')
                ->nullable()
                ->after('handle')
                ->constrained('academies')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropForeign(['active_academy_id']);
            $table->dropColumn('active_academy_id');
        });
    }
};
