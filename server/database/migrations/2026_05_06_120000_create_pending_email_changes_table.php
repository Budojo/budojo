<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `pending_email_changes` (#476). Backs the email-change-with-verification
 * flow for both surfaces:
 *
 * - Owner self-edit on `/dashboard/profile`
 * - Athlete-detail email change on a state-C athlete (linked user)
 *
 * The row exists between request-time (`POST /me/email-change` or
 * `POST /athletes/{id}/email` for state C) and confirm-time
 * (`POST /email-change/{token}/verify`). It never replaces the live
 * `users.email`; only on confirm does the action atomically copy the
 * candidate over and delete the row.
 *
 * Why a separate table instead of an `email_change_pending_*` column on
 * `users`: the per-user pending state is short-lived and inherently
 * tokenised; carrying `(token, expires_at, candidate_email)` in `users`
 * pollutes the row used by every authenticated request with fields that
 * are null 99% of the time, AND complicates the cleanup story — a
 * scheduled command can chunk through one focused table without ever
 * loading the `users` working set.
 */
return new class () extends Migration {
    public function up(): void
    {
        Schema::create('pending_email_changes', function (Blueprint $table): void {
            $table->id();

            // UNIQUE on user_id — only ONE pending change per user. A second
            // request from the same user atomically replaces the previous
            // pending row (the action upserts on this column), keeping the
            // bearer-credential surface to one live token at any moment.
            // Cascade on delete: a user that's hard-deleted (GDPR purge)
            // takes their pending row with them.
            $table->foreignId('user_id')
                ->unique()
                ->constrained('users')
                ->cascadeOnDelete();

            // The candidate email — what the user wants `users.email` to
            // become. Length matches the `users.email` ceiling.
            $table->string('new_email', 255);

            // 64-char URL-safe token. Stored as SHA-256 hex digest, NOT
            // the raw value — same discipline as `athlete_invitations`.
            // The raw token is emitted in the email body exactly once;
            // the verify endpoint hashes the URL-presented value and
            // looks up by hash, so a DB read leak does not yield live
            // bearer credentials.
            $table->string('token', 64)->unique();

            // Default 24h. The action sets the actual value at insert
            // time so a future config-driven window is one edit away.
            // Indexed because the scheduled cleanup command filters on
            // `expires_at < now()` to prune the dead cohort.
            $table->timestamp('expires_at')->index();

            // When the user clicked "change email" — separate from
            // `created_at` so a future support request like "when did
            // Mario request the change?" stays stable across migration
            // touch-ups.
            $table->timestamp('requested_at');

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pending_email_changes');
    }
};
