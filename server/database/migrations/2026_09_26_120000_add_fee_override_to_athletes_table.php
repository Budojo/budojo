<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A monthly fee for this athlete only (#1757), the second half of
        // #1381's "default plus deroga". Null: no override, the tier or the
        // academy fee applies. Zero: this athlete trains free.
        Schema::table('athletes', function (Blueprint $table): void {
            $table->unsignedInteger('fee_override_cents')->nullable()->after('fee_tier_id');
        });
    }

    public function down(): void
    {
        Schema::table('athletes', function (Blueprint $table): void {
            $table->dropColumn('fee_override_cents');
        });
    }
};
