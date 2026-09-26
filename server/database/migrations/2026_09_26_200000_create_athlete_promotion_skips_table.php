<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The steps an owner said an athlete never took (#1966) — "Saltato" on a
 * ghost row in the promotion timeline. A BJJ white belt can go to blue from
 * three stripes; without somewhere to say so, that gap would come back on
 * every visit.
 *
 * Keyed by the state the step would have led to (`belt` + `stripes`), which
 * is what a gap is keyed by, so a skip outlives any row being added or
 * removed around it.
 */
return new class () extends Migration {
    public function up(): void
    {
        Schema::create('athlete_promotion_skips', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('athlete_id')->constrained()->cascadeOnDelete();
            $table->string('belt', 32);
            $table->unsignedTinyInteger('stripes');
            $table->timestamps();

            $table->unique(['athlete_id', 'belt', 'stripes']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('athlete_promotion_skips');
    }
};
