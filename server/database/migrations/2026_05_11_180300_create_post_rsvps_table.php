<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `post_rsvps` (#600, M9 community layer). RSVP on an `event`-type
 * community post — see `App\Enums\RsvpResponse` for the allowed
 * values (V1: going + maybe; the absence of a row = "no answer").
 *
 * The FK does NOT enforce that `post_id` points at a row where
 * `community_posts.type = 'event'` — that's the Action layer's job
 * (validates the post type before inserting). DB-side FK is the
 * generic post FK.
 *
 * Tenant isolation: no `academy_id` column. Joins back through
 * `community_posts.academy_id` exactly like the reactions /
 * comments tables.
 */
return new class () extends Migration {
    public function up(): void
    {
        Schema::create('post_rsvps', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('post_id')
                ->constrained('community_posts')
                ->cascadeOnDelete();

            $table->foreignId('user_id')
                ->constrained('users')
                ->cascadeOnDelete();

            // `going` | `maybe` per the RsvpResponse enum. No
            // `declined` value — see the enum docblock.
            $table->string('response', 16);

            $table->timestamps();

            // One RSVP per (user, event). Toggling between `going`
            // and `maybe` updates the existing row in place. The
            // UNIQUE on (post_id, user_id) also serves as the lookup
            // index for post_id-only aggregation (leftmost-prefix);
            // no separate index needed. Same convention as
            // `addresses` (see 2026_04_27_120000_create_addresses_table.php).
            $table->unique(['post_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('post_rsvps');
    }
};
