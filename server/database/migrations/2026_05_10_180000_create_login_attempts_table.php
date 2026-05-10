<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `login_attempts` (#430). Read-only audit log of every authentication
 * attempt — successful AND failed. Backs the user-facing "Login
 * history" panel on `/dashboard/profile/security` and the underlying
 * compromise-detection signal ("if a row here looks unfamiliar, change
 * your password").
 *
 * **Why every attempt, not just successes**: failed-login bursts ARE
 * the compromise signal. Surfacing only successes hides the very thing
 * the user wants to detect.
 *
 * **Why a separate table over Sanctum's `personal_access_tokens`**:
 * Sanctum tracks LIVE tokens (one row per active session); a revoked
 * token's row goes away. Login history needs to PERSIST across
 * revocations — a token revoked yesterday is exactly the row a user
 * scanning their history wants to see.
 *
 * **Retention**: 90 days. Pruned by an Artisan command scheduled in
 * `routes/console.php` next to the existing cleanup crons. Older rows
 * are deleted; the security signal value drops fast after a couple of
 * weeks anyway.
 *
 * **Privacy**: `ip_address` is personal data per GDPR Art. 4 (1).
 * Storage justified by Art. 6 (1) (f) — legitimate interest in
 * security and audit. Retention disclosed in `/privacy` and the DPA
 * template.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('login_attempts', function (Blueprint $table): void {
            $table->id();

            // Nullable: a failed login on a non-existent email has no
            // user_id to attach. The email_attempted field captures
            // the typed value either way. cascadeOnDelete so the row
            // tracks the user's lifecycle — when the user is hard-
            // deleted (#223 grace window elapses), their login history
            // goes with them. GDPR-aligned: no orphan personal data.
            $table->foreignId('user_id')
                ->nullable()
                ->constrained('users')
                ->cascadeOnDelete();

            // The email the caller actually typed at the form, lower-
            // cased server-side before insert. We DO log this on a
            // failed attempt against a never-registered email — it's
            // the audit trail value (a user inspecting their list
            // sees "someone tried admin@example.com from $IP" even
            // when no user matches).
            $table->string('email_attempted', 255);

            // IPv4 = up to 15 chars, IPv6 textual max = 45 chars.
            // Nullable to handle the rare case where the request
            // arrives without a recoverable client IP (proxy stripped
            // it, test-runner, etc.) — we still want to log the
            // attempt rather than 500.
            $table->string('ip_address', 45)->nullable();

            // UA strings are long (~200-400 chars typical, edge cases
            // longer). Cap at 1024 to bound row size; longer values
            // are truncated server-side before insert.
            $table->string('user_agent', 1024)->nullable();

            $table->boolean('success');

            // Created-at only; logs are immutable.
            $table->timestamp('created_at')->useCurrent();

            // The list query on the user's own surface filters by
            // `user_id` and orders by `created_at DESC`. The composite
            // index covers both halves cheaply.
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('login_attempts');
    }
};
