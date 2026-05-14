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
        // PHP-side loop instead of a raw SQL INSERT IGNORE — the
        // INSERT IGNORE / INSERT OR IGNORE syntax is vendor-specific
        // (MySQL vs SQLite vs Postgres), and the CI suite runs against
        // SQLite while dev / prod run MySQL. Using the query builder
        // with the obvious INSERT-or-skip pattern keeps the migration
        // portable across all three. The loop is O(academies) and
        // runs once per environment — operationally cheap.
        $now = now();

        DB::table('academies')
            ->whereNotNull('user_id')
            ->orderBy('id')
            ->each(function (object $academy) use ($now): void {
                $exists = DB::table('academy_memberships')
                    ->where('user_id', $academy->user_id)
                    ->where('academy_id', $academy->id)
                    ->exists();
                if ($exists) {
                    return;
                }

                DB::table('academy_memberships')->insert([
                    'user_id' => $academy->user_id,
                    'academy_id' => $academy->id,
                    'role' => 'owner',
                    'joined_at' => $academy->created_at ?? $now,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
            });

        // Each user's active-academy pointer. Cross-vendor: an UPDATE
        // FROM / JOIN syntax differs between MySQL and SQLite, so we
        // walk the users table the same way — one UPDATE per owner.
        DB::table('users')
            ->whereNull('active_academy_id')
            ->orderBy('id')
            ->each(function (object $user): void {
                $academyId = DB::table('academies')
                    ->where('user_id', $user->id)
                    ->value('id');
                if ($academyId === null) {
                    return;
                }
                DB::table('users')
                    ->where('id', $user->id)
                    ->update(['active_academy_id' => $academyId]);
            });
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
