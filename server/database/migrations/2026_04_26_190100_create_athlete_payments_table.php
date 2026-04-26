<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('athlete_payments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('athlete_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('year');
            $table->unsignedTinyInteger('month'); // 1-12, validated at request layer
            // Snapshotted from academy.monthly_fee_cents at the moment of
            // recording — future fee changes do NOT rewrite paid history.
            $table->unsignedInteger('amount_cents');
            // The wall-clock time the payment was recorded in the system.
            // For now equal to created_at (the API doesn't accept a custom
            // paid_at), but kept as a separate column so a future "back-date
            // a payment" feature has somewhere to store the business date.
            $table->timestamp('paid_at');
            $table->timestamps();

            // One payment per (athlete, year, month) — idempotency at the
            // DB level. The action checks for an existing row first and
            // returns it instead of attempting an insert that would fail
            // with a unique-constraint violation.
            $table->unique(['athlete_id', 'year', 'month']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('athlete_payments');
    }
};
