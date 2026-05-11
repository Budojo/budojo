<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `post_comments` (#600, M9 community layer). 1-level comments
 * under a community post — no nested replies (PRD hard rule).
 * Authored by any user (athlete or owner); the owner moderates by
 * soft-deleting offending comments.
 *
 * Body is stored as `text` with a 500-char length enforced at the
 * FormRequest layer (NOT in SQL DDL — keeps the migration portable
 * across MySQL / SQLite for PEST in-memory tests).
 *
 * Tenant isolation: no `academy_id` column. Joins back through
 * `community_posts.academy_id`; see the `post_reactions` migration
 * for the same rationale.
 */
return new class () extends Migration {
    public function up(): void
    {
        Schema::create('post_comments', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('post_id')
                ->constrained('community_posts')
                ->cascadeOnDelete();

            $table->foreignId('user_id')
                ->constrained('users')
                ->cascadeOnDelete();

            // 500-char limit enforced via FormRequest validation, not
            // in DDL. Storing as text keeps the migration portable to
            // SQLite (which doesn't enforce varchar length anyway) and
            // leaves headroom if the limit ever needs to change.
            $table->text('body');

            $table->timestamps();
            $table->softDeletes();

            // Comment-thread query under a single post:
            // `WHERE post_id = ? AND deleted_at IS NULL
            //  ORDER BY created_at LIMIT N`.
            $table->index(['post_id', 'deleted_at', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('post_comments');
    }
};
