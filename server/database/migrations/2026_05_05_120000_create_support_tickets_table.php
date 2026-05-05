<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `support_tickets` (#423). Backs the dedicated /dashboard/support
 * contact form — distinct from the in-app feedback flow (#311) which is
 * fire-and-forget without a paper trail. A ticket row is the durable
 * record that the user reached out; the queued `SupportTicketMail` is
 * the side-effect that actually opens the conversation in the support
 * inbox (Reply-To set to the user so a reply lands in their mailbox
 * directly, no further round-tripping required).
 *
 * No status column on purpose — full ticketing (status / threads /
 * attachments / live chat) is explicitly out of scope per the issue
 * body. When (if) that lands, a follow-up migration adds `status`
 * + `assigned_to` etc. without re-shaping this table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('support_tickets', function (Blueprint $table): void {
            $table->id();

            // Nullable foreign key for the planned mailto: fallback
            // (logged-out users hitting the public footer link can't
            // sign in just to file a ticket). The current PR only wires
            // the authenticated path; nullable here keeps the schema
            // forward-compatible without a follow-up ALTER.
            $table->foreignId('user_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->string('subject', 100);

            // String column rather than `enum(...)` so the four-case
            // SupportTicketCategory enum can grow (e.g. `feature`)
            // without an ALTER TABLE on production. Validated at the
            // FormRequest boundary; the cast on the model coerces back
            // to the typed enum on read.
            $table->string('category', 32);

            $table->text('body');

            // Only `created_at` is meaningful for an audit trail —
            // ticket rows are immutable from the user's perspective
            // (no edit endpoint), so `updated_at` would always equal
            // `created_at`. Drop the column to keep the schema honest.
            $table->timestamp('created_at')->useCurrent();

            // Indexed for the eventual ops dashboard / "tickets I
            // submitted" view. user_id alone is enough today; the
            // composite (user_id, created_at) shape is YAGNI until a
            // history page actually paginates by user.
            $table->index('user_id');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('support_tickets');
    }
};
