<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('achievements', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('athlete_id')->constrained()->cascadeOnDelete();
            // Backed-string enum (App\Enums\AchievementKind). Width
            // generous so a future kind doesn't overflow the column.
            $table->string('kind', 64);
            // When the kind was first unlocked for this athlete. The
            // (athlete_id, kind) pair is UNIQUE — the rule fires once.
            // The evaluator is idempotent: a second check that finds
            // the row in place is a no-op.
            $table->timestamp('unlocked_at');
            // Free-form payload for kind-specific metadata (e.g. the
            // belt that triggered a `belt_promotion` link, or the
            // streak length for `30_day_streak`).
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->unique(['athlete_id', 'kind']);
            // Most-recent-first read pattern from the public profile.
            $table->index(['athlete_id', 'unlocked_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('achievements');
    }
};
