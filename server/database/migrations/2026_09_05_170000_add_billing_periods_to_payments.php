<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('athlete_payments', function (Blueprint $table): void {
            // How many months this one payment covers (#1382). `year` and
            // `month` stop meaning "the month paid for" and start meaning
            // "the month the period starts in" — for a monthly payment those
            // are the same sentence, which is why the default of 1 makes
            // every existing row correct without a backfill.
            //
            // The whole point of the interval living on one row: an athlete
            // who pays quarterly made ONE payment and holds ONE receipt.
            // Three monthly rows would be a lie about what happened.
            $table->unsignedTinyInteger('period_months')->default(1)->after('month');
        });

        Schema::table('athletes', function (Blueprint $table): void {
            // What this athlete is expected to pay on (#1382). Not the same
            // question as what they last paid: the app needs the expectation
            // to answer "is anyone late", which is what the unpaid widget,
            // the owner's digest and the overdue push all ask.
            //
            // Default 1 — monthly — which is every athlete today.
            $table->unsignedTinyInteger('billing_period_months')->default(1)->after('fee_tier_id');
        });
    }

    public function down(): void
    {
        Schema::table('athletes', function (Blueprint $table): void {
            $table->dropColumn('billing_period_months');
        });

        Schema::table('athlete_payments', function (Blueprint $table): void {
            $table->dropColumn('period_months');
        });
    }
};
