<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `pending_deletions` (#223). Backs the GDPR-Art-17 right-to-erasure
 * flow. A row in here means the user clicked "Delete account" — they
 * are in a 30-day grace window. The window is observed at the SPA
 * layer for now (banner + cancel CTA); login and authenticated API
 * access still work during the window — see the issue body's "Login
 * during grace" open question for the planned hardening. After
 * `scheduled_for`, the hourly Artisan command
 * `budojo:purge-expired-pending-deletions` (scheduled from
 * `routes/console.php`) runs `PurgeAccountAction` to do the actual
 * hard-delete.
 *
 * Why a separate table instead of a `deleted_at`-style soft-delete on
 * `users`: see the issue body's "Decisioni prese" — soft-delete on
 * User has too many side-effects (email uniqueness leak, login filter
 * surface), and a grace period table gives us an explicit, time-bounded
 * mechanism with a known expiry.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pending_deletions', function (Blueprint $table): void {
            $table->id();

            // One pending deletion per user max — a second click on the
            // delete button while one is already pending is a no-op.
            $table->foreignId('user_id')
                ->unique()
                ->constrained('users')
                ->cascadeOnDelete();

            // When the user actually clicked the button.
            $table->timestamp('requested_at');

            // 30 days after `requested_at`. Indexed because the cron
            // job filters on `scheduled_for <= now()` to find the
            // accounts that have aged past the grace window.
            $table->timestamp('scheduled_for')->index();

            // Random 64-char opaque token issued at request time. The
            // current PR's cancellation flow uses the authenticated
            // session (DELETE /me/deletion-request); a follow-up will
            // surface this token as a one-time email link for the
            // "click here to cancel" flow. UNIQUE so token-based
            // lookup stays unambiguous and indexed cheaply.
            $table->string('confirmation_token', 64)->unique();

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pending_deletions');
    }
};
