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
        Schema::table('carnets', function (Blueprint $table): void {
            // When the carnet starts covering sessions (#1380). Separate from
            // `purchased_at` because the two answer different questions: one is
            // when money changed hands, the other is what the carnet pays for.
            // Editable after the sale, which is the whole point — an owner
            // transcribing a paper register needs to say "this covers from
            // March", and the sessions already recorded in March must count.
            $table->date('valid_from')->nullable()->after('price_cents');
        });

        // Existing carnets kept exactly the behaviour they had: validity began
        // the day they were sold, so the backfill is a copy and no balance
        // moves. `expires_at` is already `purchased_at + 12 months` on those
        // rows, which is the same thing as `valid_from + 12 months` here.
        DB::table('carnets')->whereNull('valid_from')->update([
            'valid_from' => DB::raw('purchased_at'),
        ]);

        Schema::table('carnets', function (Blueprint $table): void {
            $table->date('valid_from')->nullable(false)->change();
        });

        Schema::table('carnets', function (Blueprint $table): void {
            // The window lookup moved off `purchased_at`, so the index that
            // served it has to move too.
            $table->index(['athlete_id', 'valid_from']);
        });
    }

    public function down(): void
    {
        Schema::table('carnets', function (Blueprint $table): void {
            $table->dropIndex(['athlete_id', 'valid_from']);
            $table->dropColumn('valid_from');
        });
    }
};
