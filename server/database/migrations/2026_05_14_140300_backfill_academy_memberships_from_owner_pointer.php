<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Data backfill for the multi-user transition (#427 / #714).
 *
 * Single-owner academies migrate cleanly: every existing
 * `academies.user_id` becomes a `(user_id, academy_id, role: owner)`
 * row in `academy_memberships`, with `joined_at` set to the academy's
 * `created_at` (best approximation — we don't have the legacy moment
 * the link was made, but the academy can't have existed before that).
 *
 * `users.active_academy_id` gets populated with the academy each user
 * owns, when they own one. Users who DON'T own an academy (athlete
 * portal users, future-staff users) keep the column NULL — the SPA's
 * dashboard guards will route them to the academy-pick or
 * account-creation flows as appropriate.
 *
 * **Idempotency**: the migration uses `INSERT IGNORE` semantics
 * (`onConflictIgnore` on the SQL builder) so re-running on a partially-
 * migrated DB is safe. Same for the `active_academy_id` update —
 * the WHERE clause guards against overwriting a non-null value.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = DB::raw('NOW()');

        // 1. Membership rows — every academy that has a user_id pointer.
        DB::statement(
            'INSERT IGNORE INTO academy_memberships
             (user_id, academy_id, role, joined_at, created_at, updated_at)
             SELECT user_id, id, ?, created_at, ?, ?
             FROM academies
             WHERE user_id IS NOT NULL',
            ['owner', now(), now()],
        );

        // 2. Each user's active academy pointer. Only update users who
        //    own an academy AND don't already have a value set.
        DB::statement(
            'UPDATE users u
             JOIN academies a ON a.user_id = u.id
             SET u.active_academy_id = a.id
             WHERE u.active_academy_id IS NULL',
        );

        // Quiet the unused variable warning for the `$now` raw we kept
        // around in case a future iteration wants to write a literal
        // timestamp instead of the named-binding now() value.
        unset($now);
    }

    public function down(): void
    {
        // The forward migration is destructive of the prior "no
        // memberships" state by definition; rolling back means
        // truncating the membership rows we just wrote AND
        // null-ing out active_academy_id. The schema migrations
        // (140000 / 140100 / 140200) handle the actual table /
        // column drops on their own `down()`.
        DB::table('academy_memberships')->truncate();
        DB::table('users')->update(['active_academy_id' => null]);
    }
};
