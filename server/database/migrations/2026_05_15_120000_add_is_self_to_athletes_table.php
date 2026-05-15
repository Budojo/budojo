<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mark the athlete row that represents an academy staff member
 * training in their own academy (#748, part of epic #747).
 *
 * `is_self = true` flips the row into a special branch across the
 * codebase:
 *
 *  - The roster shows an `Owner` chip next to the name.
 *  - Payment surfaces (current-month flag, overdue digest, unpaid
 *    monthly digest) skip the row — the owner isn't billed.
 *  - `DeleteAthleteAction` rejects 403 — the only way to leave the
 *    roster is the dedicated `DELETE /api/v1/me/athlete` endpoint,
 *    which soft-deletes (history preserved if they re-enroll later).
 *
 * The `(academy_id, is_self)` composite index serves the two hot
 * read paths: the unpaid-this-month digest scope (`WHERE academy_id
 * = ? AND is_self = false`) and the resource lookup the
 * `EnrollSelfAsAthleteAction` does to enforce idempotency
 * (`WHERE academy_id = ? AND user_id = ? AND is_self = true`).
 */
return new class () extends Migration {
    public function up(): void
    {
        Schema::table('athletes', function (Blueprint $table): void {
            $table->boolean('is_self')
                ->default(false)
                ->after('user_id');

            $table->index(['academy_id', 'is_self']);
        });
    }

    public function down(): void
    {
        Schema::table('athletes', function (Blueprint $table): void {
            $table->dropIndex(['academy_id', 'is_self']);
            $table->dropColumn('is_self');
        });
    }
};
