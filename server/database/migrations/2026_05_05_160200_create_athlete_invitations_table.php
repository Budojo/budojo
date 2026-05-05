<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The token-based invitation row for the athlete-side onboarding
 * flow (#445, M7 PR-A schema foundation).
 *
 * Lifecycle states are derivable from the column triplet
 * `(accepted_at, revoked_at, expires_at)`:
 *
 * - **pending** — none of the three negate the row, expires_at is in the future
 * - **accepted** — accepted_at is set; the linked athlete now has a `users.id`
 * - **revoked**  — revoked_at is set by the owner before the athlete accepts
 * - **expired**  — accepted_at + revoked_at both null, expires_at is past
 *
 * The column triplet keeps the audit trail intact (revoked or expired
 * rows are never deleted, only flagged), which matters for two
 * reasons: support requests like "did Mario actually receive an
 * invite last spring?" and GDPR Art. 15 access requests.
 */
return new class () extends Migration {
    public function up(): void
    {
        Schema::create('athlete_invitations', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('athlete_id')
                ->constrained()
                ->cascadeOnDelete();

            $table->foreignId('academy_id')
                ->constrained()
                ->cascadeOnDelete();

            $table->foreignId('sent_by_user_id')
                ->constrained('users')
                ->cascadeOnDelete();

            // Snapshot of the athlete's email at invite time. We could
            // dereference `athletes.email` at every read, but the email
            // can change on the athlete row after the invite is sent —
            // and we want the "we emailed THIS address on THAT date"
            // audit trail to stay intact. Length matches the
            // `users.email` and `athletes.email` ceiling.
            $table->string('email', 255);

            // 64-char URL-safe token. Not signed by Laravel's
            // `URL::temporarySignedRoute` (the action stores the raw
            // token + checks expiry from this row) — keeping the
            // signing surface inside our own code makes the audit /
            // revocation flow simpler and avoids cross-coupling to the
            // app key rotation.
            $table->string('token', 64)->unique();

            // Default 7-day expiry; the action sets the actual value
            // at insert time so a future config-driven window is one
            // edit away.
            $table->timestamp('expires_at');

            // Lifecycle terminators — both nullable, both default null.
            $table->timestamp('accepted_at')->nullable();
            $table->timestamp('revoked_at')->nullable();

            // Bumped on resend. Defaults to `created_at` at insert.
            $table->timestamp('last_sent_at')->nullable();

            $table->timestamps();

            // Index pattern: a list of "pending invites for this
            // athlete" is the hot-path read on the athlete detail
            // page, and the unique token lookup is the hot-path on
            // the accept endpoint.
            $table->index(['athlete_id', 'accepted_at', 'revoked_at']);
            $table->index('email');
            $table->index('expires_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('athlete_invitations');
    }
};
