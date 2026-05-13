<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Owner-facing log of every belt + stripe promotion an athlete has
 * received (feature request post-v2.9.0: "voglio ricordarmi quando ho
 * dato la striscia a chi"). Today the AthleteObserver only emits a
 * `belt_promotion` CommunityPost; that post is feed-shaped, not a
 * queryable history record. This table is the single source of truth.
 *
 * One row per promotion event. `kind` discriminates the shape:
 * - `belt`: `from_belt` + `to_belt` populated; stripe columns null.
 *   `from_belt` is null on the athlete's first belt assignment (no
 *   prior belt to record).
 * - `stripe`: `from_stripes` + `to_stripes` populated; belt columns
 *   null. Stripes are 0–4 per Athlete::stripes column.
 *
 * `recorded_by_user_id` carries the editor (owner who recorded the
 * promotion via the athletes form). On console / seeder context the
 * observer skips the record entirely (no user to attribute) so this
 * column is non-nullable.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('athlete_promotions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('athlete_id')->constrained()->cascadeOnDelete();
            // Enum kept narrow on purpose: a third value lands when a
            // new milestone type appears (e.g. "rank" if the federation
            // adds one). Today's two cover the BJJ surface fully.
            $table->enum('kind', ['belt', 'stripe']);
            // Belt enum mirrors App\Enums\Belt — string, not FK, so
            // dropping a belt option doesn't orphan the history.
            $table->string('from_belt', 16)->nullable();
            $table->string('to_belt', 16)->nullable();
            $table->unsignedTinyInteger('from_stripes')->nullable();
            $table->unsignedTinyInteger('to_stripes')->nullable();
            $table->timestamp('recorded_at');
            $table->foreignId('recorded_by_user_id')->constrained('users')->restrictOnDelete();
            $table->timestamps();

            // Hot path: athlete detail page reads "all promotions for
            // this athlete, descending date". Single composite index
            // covers both filter + sort. The athlete-scoped query
            // dominates; a global "all promotions today" sweep is rare
            // enough that a second index isn't warranted today.
            $table->index(['athlete_id', 'recorded_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('athlete_promotions');
    }
};
