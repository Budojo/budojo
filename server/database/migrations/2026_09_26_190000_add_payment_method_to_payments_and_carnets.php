<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How a fee or a carnet was paid (#1761), `App\Enums\PaymentMethod`.
 *
 * Nullable, and nothing is backfilled: null is "not recorded", and every row
 * written before this migration genuinely was not.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('athlete_payments', function (Blueprint $table): void {
            $table->string('payment_method', 16)->nullable()->after('paid_at');
        });

        Schema::table('carnets', function (Blueprint $table): void {
            $table->string('payment_method', 16)->nullable()->after('purchased_at');
        });
    }

    public function down(): void
    {
        Schema::table('athlete_payments', function (Blueprint $table): void {
            $table->dropColumn('payment_method');
        });

        Schema::table('carnets', function (Blueprint $table): void {
            $table->dropColumn('payment_method');
        });
    }
};
