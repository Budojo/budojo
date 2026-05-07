<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * #479 — Refactor `users.name` (single freeform column) into:
     *
     *   - `first_name` (NOT NULL, default '') — given name
     *   - `last_name`  (NOT NULL, default '') — family name
     *   - `handle`     (nullable, UNIQUE)     — Instagram-style user-
     *     chosen identifier (`@matteo`). 30 chars max, lowercase only,
     *     `[a-z0-9_.]`, must start with a letter, no consecutive dots,
     *     no leading/trailing dot. Lowercased on save (the UNIQUE index
     *     is therefore effectively case-insensitive).
     *
     * Mirrors the precedent set on `athletes.first_name` + `last_name`
     * (#103) for the legal-name split. The `handle` column is a new
     * concept the M7 dual-persona shape (#445) unlocks — substrate for
     * future mention / public-profile / fighter-card surfaces, none of
     * which ship in V1. V1 is the column + a profile-page edit
     * affordance; downstream consumers land in their own issues.
     *
     * Backfill: split each existing `name` on the FIRST space.
     * Multi-word last names ("Maria De Luca") stay intact under
     * `last_name`. A single-token name lands as `first_name` only,
     * `last_name` stays empty (caller can edit on next profile visit).
     * Handles stay NULL on backfill — every existing user opts in
     * later if they want one.
     */
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            // The `default('')` keeps SQLite happy when adding NOT NULL
            // columns to a populated table; the backfill below rewrites
            // every row so the default never escapes into production data.
            $table->string('first_name')->default('')->after('id');
            $table->string('last_name')->default('')->after('first_name');
            $table->string('handle', 30)->nullable()->after('last_name');
            $table->unique('handle');
        });

        // Backfill: split each existing `name` on the FIRST whitespace
        // run. `preg_split` with `\s+` collapses tabs / non-breaking
        // spaces / multi-space sequences into a single split point —
        // explode(' ', ...) would leave `last_name` starting with a
        // space for `"Mario   Rossi"` and would miss tab-separated
        // input entirely. Both pieces are trimmed defensively.
        DB::table('users')->orderBy('id')->each(function (object $row): void {
            $raw = is_string($row->name) ? trim($row->name) : '';
            if ($raw === '') {
                return;
            }

            $parts = preg_split('/\s+/', $raw, 2) ?: [$raw];
            $firstName = trim($parts[0]);
            $lastName = isset($parts[1]) ? trim($parts[1]) : '';

            DB::table('users')->where('id', $row->id)->update([
                'first_name' => $firstName,
                'last_name' => $lastName,
            ]);
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('name');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            // Re-add the legacy column. Default '' covers the SQLite
            // NOT-NULL-add gotcha; the recompose loop below fills it.
            $table->string('name')->default('')->after('id');
        });

        DB::table('users')->orderBy('id')->each(function (object $row): void {
            $first = is_string($row->first_name) ? trim($row->first_name) : '';
            $last = is_string($row->last_name) ? trim($row->last_name) : '';
            $recomposed = trim($first . ' ' . $last);

            DB::table('users')->where('id', $row->id)->update([
                'name' => $recomposed,
            ]);
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->dropUnique(['handle']);
            $table->dropColumn(['first_name', 'last_name', 'handle']);
        });
    }
};
