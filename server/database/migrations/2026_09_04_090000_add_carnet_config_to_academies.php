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
            // Both nullable, mirroring `monthly_fee_cents`: null means "this
            // academy doesn't sell carnets", and selling one is rejected with
            // a 422 until the owner configures the pair.
            $table->unsignedInteger('carnet_price_cents')->nullable()->after('monthly_fee_cents');
            $table->unsignedTinyInteger('carnet_entries')->nullable()->after('carnet_price_cents');
        });
    }

    public function down(): void
    {
        Schema::table('academies', function (Blueprint $table): void {
            $table->dropColumn(['carnet_price_cents', 'carnet_entries']);
        });
    }
};
