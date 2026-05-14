<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Multi-user memberships (#427 / #714, sub-issue 1/9).
 *
 * One row per (user, academy) pair the user has been added to. The
 * `role` column drives every authz check via the capability matrix in
 * `docs/specs/multi-user.md` § 4.
 *
 * **Why `varchar(16)` and not native MySQL `ENUM`**: convention across
 * this codebase — `users.role`, `athletes.belt`, `athletes.status`
 * are all varchar columns with PHP enum casts. Adding a future role
 * value never needs an `ALTER TABLE` and survives MySQL replica-lag
 * rollouts cleanly.
 *
 * **`revoked_at`**: soft-revoke instead of hard delete so the audit
 * trail of "who joined when, who left when" survives across membership
 * churn. The active-memberships read path filters `WHERE revoked_at
 * IS NULL`; the unique index is over (user_id, academy_id) regardless
 * of revoke state, so re-adding a previously-revoked member is an
 * UPDATE on the same row (set `revoked_at = NULL`, optionally update
 * `role`), not an INSERT.
 *
 * **Invariant**: every academy MUST have exactly one active
 * (`revoked_at IS NULL`) `owner` membership. Enforced by an Action-
 * layer check (sub-issue 5/9) and a DB-level trigger (the next
 * migration in this series, when we're confident no other test
 * artefact races us at TRUNCATE).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('academy_memberships', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')
                ->constrained('users')
                ->cascadeOnDelete();
            $table->foreignId('academy_id')
                ->constrained('academies')
                ->cascadeOnDelete();
            // varchar instead of native ENUM — see header.
            $table->string('role', 16);
            $table->timestamp('joined_at');
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            // One membership row per (user, academy). A revoked row
            // still occupies the slot — re-adding flips revoked_at to
            // null in place.
            $table->unique(['user_id', 'academy_id'], 'academy_memberships_user_academy_unique');
            $table->index(['academy_id', 'role'], 'academy_memberships_academy_role_index');
            $table->index('revoked_at', 'academy_memberships_revoked_at_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('academy_memberships');
    }
};
