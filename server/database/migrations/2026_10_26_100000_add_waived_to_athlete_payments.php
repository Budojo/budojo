<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A month the owner let the athlete off (#2167): recorded like a payment so
 * every "who owes" rule reads it as settled, at €0 and marked, so nothing
 * that counts money mistakes it for one. Every row before it was paid.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('athlete_payments', function (Blueprint $table): void {
            $table->boolean('waived')->default(false)->after('payment_method');
        });
    }

    public function down(): void
    {
        Schema::table('athlete_payments', function (Blueprint $table): void {
            $table->dropColumn('waived');
        });
    }
};
