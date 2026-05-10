<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * In-app notification inbox (#418). Standard Laravel `notifications`
 * table shape — owned by `Notifiable` users, written by the existing
 * reminder Actions (medical-cert expiry digest, unpaid-athletes
 * monthly digest), surfaced by a bell-icon dropdown in the dashboard
 * topbar.
 *
 * **Distinct from `notification_log`**: that table is academy-scoped
 * dedup for OUTBOUND emails (so a re-run of the cron doesn't email
 * twice). This table is user-scoped inbox state — what the user sees
 * in the bell. The two coexist; the bell is populated alongside the
 * email channel, not instead of it.
 *
 * Standard Laravel polymorphic shape — `notifiable_type` /
 * `notifiable_id` so a future "academy as notifiable" expansion lands
 * without an `ALTER TABLE`. Today every row is `notifiable_type =
 * App\Models\User`.
 *
 * **Cardinality cap** — no auto-prune today. The reminder digests
 * run daily / monthly so a single owner's inbox grows by ~13 rows
 * per year. We'll add a TTL (or a "keep last 100 per user" sweep)
 * if the table starts producing scan-cost concerns.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table): void {
            // UUID PK matches the default Laravel
            // `Notifiable::notifications()` relation contract — adding
            // an int surrogate would force a custom relation override.
            $table->uuid('id')->primary();

            // Notification class name (e.g.
            // `App\Notifications\MedicalCertExpiringNotification`). The
            // SPA reads this to choose the right title / link template.
            $table->string('type');

            // Polymorphic owner. Always `App\Models\User` for V1; the
            // shape leaves room for a future per-academy feed.
            $table->morphs('notifiable');

            // Free-form JSON payload — the data the Notification's
            // `toDatabase()` returns. The SPA reads `data.title`,
            // `data.body`, `data.link` keys to render each row.
            $table->json('data');

            // Set when the user explicitly marks the row read OR when
            // they click "Mark all as read". Null = unread; drives the
            // bell-icon unread count.
            $table->timestamp('read_at')->nullable();

            $table->timestamps();

            // Per-user unread query — `WHERE notifiable_type=?
            // AND notifiable_id=? AND read_at IS NULL ORDER BY
            // created_at DESC LIMIT 20` is the bell-open hot path.
            $table->index(['notifiable_type', 'notifiable_id', 'read_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
