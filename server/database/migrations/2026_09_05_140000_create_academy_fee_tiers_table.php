<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('academy_fee_tiers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('academy_id')->constrained()->cascadeOnDelete();
            // What the owner calls it — "2 lezioni", "Ragazzi". Free text,
            // because an academy's own vocabulary is the useful label.
            $table->string('label', 60);
            $table->unsignedInteger('amount_cents');
            // Structured, not buried in the label (#1381): "the athlete on the
            // 2-lesson tier trained four times this week" is the kind of thing
            // a register exists to notice, and a string cannot be asked.
            $table->unsignedTinyInteger('lessons_per_week');
            $table->timestamps();

            // One label per academy: two tiers called "2 lezioni" at different
            // prices is a mistake, not a use case.
            $table->unique(['academy_id', 'label']);
        });

        Schema::table('athletes', function (Blueprint $table): void {
            // Null means "the academy's own `monthly_fee_cents`", which is what
            // every athlete is on today — so this ships without a backfill and
            // without moving a single existing payment.
            //
            // nullOnDelete, not cascade: deleting a price tier must not delete
            // the people who were on it. They fall back to the academy fee.
            $table->foreignId('fee_tier_id')->nullable()->after('academy_id')
                ->constrained('academy_fee_tiers')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('athletes', function (Blueprint $table): void {
            $table->dropForeign(['fee_tier_id']);
            $table->dropColumn('fee_tier_id');
        });

        Schema::dropIfExists('academy_fee_tiers');
    }
};
