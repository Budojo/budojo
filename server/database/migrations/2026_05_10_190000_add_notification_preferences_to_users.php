<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-category email-notification opt-out preferences (#416).
 *
 * Stored as a JSON object on the user row keyed by category string
 * (e.g. `medical_cert_expiry_reminders`, `unpaid_athletes_digest`)
 * with a boolean value: `true` (or absence) = enabled, `false` =
 * opted out. The dispatchers consult `NotificationPreferences::isEnabled`
 * before dispatching so an opted-out user is silently skipped.
 *
 * **Default-enabled**: omitting a category from the JSON means the
 * user is opted IN — preserves the historical behavior for existing
 * users (no row mutation needed at deploy time) and means a future
 * new category ships enabled-by-default until the user actively
 * opts out. Document carefully wherever this is consumed.
 *
 * **NOT toggleable from this column**: transactional emails
 * (welcome, password-reset, email-verification, account-deletion-
 * confirmation, account-deletion-cancel-link). Those are legally
 * required or security-load-bearing; the SPA panel shows them
 * as read-only "always sent" rows for transparency.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            // Nullable JSON: `null` and `{}` are both equivalent to
            // "all categories enabled" so existing users don't need
            // a backfill on deploy. The column reads/writes as an
            // array via Eloquent's `array` cast on the model.
            $table->json('notification_preferences')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('notification_preferences');
        });
    }
};
