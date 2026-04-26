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
            // Cents, not euros — int storage avoids float rounding errors.
            // Nullable: an academy that hasn't configured a fee yet doesn't
            // pay the cost of a synthetic "0 means unset" sentinel; null is
            // the explicit "not configured" signal the resource emits.
            $table->unsignedInteger('monthly_fee_cents')->nullable()->after('logo_path');
        });
    }

    public function down(): void
    {
        Schema::table('academies', function (Blueprint $table): void {
            $table->dropColumn('monthly_fee_cents');
        });
    }
};
