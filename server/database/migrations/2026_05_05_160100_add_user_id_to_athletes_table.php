<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Link an athlete row to the `User` who self-serves through the
 * SPA (#445). The FK lives on `athletes` because:
 *
 * 1. An athlete row exists from the moment the owner adds it to the
 *    roster — the user account is the *later* artefact (created when
 *    the athlete accepts the invite). FK on athletes → user is
 *    nullable; FK on users → athlete would awkwardly need a
 *    "this user has no athlete record" sentinel.
 * 2. `User::athlete()` reads naturally as a `HasOne` (zero for owners,
 *    one for athletes), and `Athlete::user()` reads as a `BelongsTo`.
 * 3. Cascading the academy delete already cascades to athletes via
 *    `athletes.academy_id`, which then null-sets the user link here
 *    instead of deleting the user (the user can survive the academy
 *    closing — the row stays around but the link clears).
 */
return new class () extends Migration {
    public function up(): void
    {
        Schema::table('athletes', function (Blueprint $table): void {
            $table->foreignId('user_id')
                ->nullable()
                ->after('academy_id')
                ->constrained('users')
                ->nullOnDelete();

            // UNIQUE not merely indexed: `User::athlete()` is a HasOne
            // (an athlete user maps to exactly one athlete row), so two
            // athletes pointing at the same user_id would silently
            // break the relation invariant — `$user->athlete` would
            // return an arbitrary row. Nullable + UNIQUE allows
            // multiple NULLs (both MySQL and SQLite agree on this) so
            // every existing roster row stays legal until linked.
            $table->unique('user_id');
        });
    }

    public function down(): void
    {
        Schema::table('athletes', function (Blueprint $table): void {
            $table->dropForeign(['user_id']);
            $table->dropUnique(['user_id']);
            $table->dropColumn('user_id');
        });
    }
};
