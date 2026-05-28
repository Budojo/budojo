<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Schedule-history table (#1094). `academies.training_days` is a
        // single mutable JSON array — when the owner changes it, the
        // past loses the schedule that was actually in effect. Each row
        // here is one "this is the schedule starting on this date"
        // record; reads for date X resolve to the row with the largest
        // `effective_from <= X`.
        Schema::create('academy_schedules', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('academy_id')->constrained()->cascadeOnDelete();
            // Carbon dayOfWeek ints (0=Sun..6=Sat); null = "not configured"
            // — parity with the legacy `academies.training_days` shape so
            // backfill is a straight copy.
            $table->json('training_days')->nullable();
            $table->date('effective_from');
            $table->timestamps();

            // One transition per academy per day — schedule changes are
            // calendar-day events, not intra-day.
            $table->unique(['academy_id', 'effective_from']);

            // The hot read is "schedule effective on date X for academy
            // Y" → ORDER BY effective_from DESC LIMIT 1. Composite covers
            // both the FK filter and the sort/limit.
            $table->index(['academy_id', 'effective_from']);
        });

        // Backfill: every existing academy gets one seed row carrying
        // the current `training_days`, dated to the academy's birthday.
        // No-op for fresh installs (no academies yet).
        DB::table('academies')
            ->orderBy('id')
            ->chunkById(500, function ($rows): void {
                foreach ($rows as $a) {
                    DB::table('academy_schedules')->insert([
                        'academy_id' => $a->id,
                        // `training_days` is already a JSON string in the
                        // source column (Laravel cast on read, not write);
                        // copy verbatim — null stays null, arrays stay arrays.
                        'training_days' => $a->training_days,
                        'effective_from' => $a->created_at,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                }
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('academy_schedules');
    }
};
