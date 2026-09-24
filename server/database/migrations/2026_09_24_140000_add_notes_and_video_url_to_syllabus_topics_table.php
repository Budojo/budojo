<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Notes and a reference video on a topic (#1862).
 *
 * How a technique is taught here, and the instructional it came from. Both
 * optional, both null on every existing topic, so nothing is backfilled. The
 * link is validated `https://` by the requests — it ends up in an `href`.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('syllabus_topics', function (Blueprint $table): void {
            $table->text('notes')->nullable();
            $table->string('video_url', 500)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('syllabus_topics', function (Blueprint $table): void {
            $table->dropColumn(['notes', 'video_url']);
        });
    }
};
