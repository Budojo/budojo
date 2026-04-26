<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('academies', function (Blueprint $table): void {
            // JSON column holding a list of Carbon dayOfWeek ints (0=Sun..6=Sat).
            // Nullable: `null` means "schedule not configured" — the daily
            // check-in UI then falls back to the previous all-weekdays
            // behavior. JSON over a 7-bit mask: it round-trips cleanly to/from
            // PHP and JS arrays without bit-fiddling, and the ordering is
            // stable for the resource.
            $table->json('training_days')->nullable()->after('monthly_fee_cents');
        });
    }

    public function down(): void
    {
        Schema::table('academies', function (Blueprint $table): void {
            $table->dropColumn('training_days');
        });
    }
};
