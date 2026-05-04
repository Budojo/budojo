<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `notification_log` — race-safe de-dup for scheduled reminder emails
 * (M5 PR-D, PR-E onward). Every row records a successful queueing of
 * a digest-style email so the next scheduler run on the same day for
 * the same academy + notification type doesn't queue a duplicate.
 *
 * Without this table, a manual re-run of the artisan command (e.g. an
 * oncall investigating a missed delivery) would send a second copy of
 * the same digest to every academy. With it, the unique index makes
 * the second run a fast no-op.
 */
return new class () extends Migration {
    public function up(): void
    {
        Schema::create('notification_log', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('academy_id')
                ->constrained('academies')
                ->cascadeOnDelete();

            // Free-form string keyed by the dispatcher (e.g.
            // `medical_cert_expiry_digest`, `unpaid_athletes_digest`).
            // Kept short for index key length; the dispatcher is the
            // single source of truth on the value, no enum needed
            // until we have ≥ 3 senders sharing this table.
            $table->string('notification_type', 64);

            // The date the dispatcher used as its trigger anchor. For
            // a daily digest this is `today` at run time; for a
            // monthly digest (PR-E) it's the first-of-month for which
            // the digest applies. Kept as DATE not TIMESTAMP so a
            // re-run at 09:01 vs the first run at 09:00 collides on
            // the unique index instead of de-dup-failing on a
            // millisecond difference.
            $table->date('sent_for_date');

            $table->timestamp('created_at')->useCurrent();

            $table->unique(
                ['academy_id', 'notification_type', 'sent_for_date'],
                'notification_log_dedup_unique',
            );
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notification_log');
    }
};
