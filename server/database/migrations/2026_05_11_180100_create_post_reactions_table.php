<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `post_reactions` (#600, M9 community layer). Emoji react on a
 * community post — see `App\Enums\ReactionEmoji` for the allowed
 * set (V1: clap + pray).
 *
 * Tenant isolation: no `academy_id` column on purpose. Every read
 * query joins back to `community_posts.academy_id`; every write
 * endpoint authorises via a FormRequest gate that re-checks the
 * post belongs to the authenticated user's academy. This avoids
 * the consistency risk of denormalising academy_id and the
 * mismatch surface that would create.
 */
return new class () extends Migration {
    public function up(): void
    {
        Schema::create('post_reactions', function (Blueprint $table): void {
            $table->id();

            // Hard FK to the parent post. Cascade on delete — when an
            // owner soft-deletes a post, reactions and comments stay
            // (the parent is still present, just `deleted_at` set).
            // When a post is HARD-deleted (academy purge cascade or
            // a future GDPR pathway), reactions go with it.
            $table->foreignId('post_id')
                ->constrained('community_posts')
                ->cascadeOnDelete();

            // Whoever reacted. Cascade on user hard-delete.
            $table->foreignId('user_id')
                ->constrained('users')
                ->cascadeOnDelete();

            // The chosen emoji key (clap / pray in V1).
            $table->string('emoji', 16);

            // Reactions are append-only — no soft-delete column. The
            // user removes a reaction by deleting the row.
            $table->timestamp('created_at')->useCurrent();

            // One reaction per (user, post) — toggling to a different
            // emoji replaces the row in a single transaction (the
            // Action layer handles the swap). The UNIQUE index on
            // (post_id, user_id) also serves as the lookup index for
            // post_id-only queries (leftmost-prefix); no separate
            // index needed. Same convention as `addresses` (see
            // 2026_04_27_120000_create_addresses_table.php).
            $table->unique(['post_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('post_reactions');
    }
};
