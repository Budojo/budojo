<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('carnets', function (Blueprint $table): void {
            $table->id();
            // Human-facing handle, read off the athlete's card. Unique across
            // the table (not per-academy): a Budojo install is normally one
            // academy, and table-wide uniqueness means a code is never
            // ambiguous even in the multi-academy case.
            $table->char('code', 4)->unique();
            $table->foreignId('athlete_id')->constrained()->cascadeOnDelete();
            // Both snapshotted from the academy config at purchase — raising
            // the price later never rewrites carnets already sold.
            $table->unsignedTinyInteger('total_entries');
            $table->unsignedInteger('price_cents');
            // Business dates, not wall-clock: the owner back-dates a sale when
            // transcribing the paper register.
            $table->date('purchased_at');
            // Computed once at insert (purchased_at + 12 months) and stored, so
            // "which carnets are valid on date D" stays a plain indexed WHERE
            // and a future change to the validity period can't retroactively
            // expire carnets already sold.
            $table->date('expires_at');
            $table->timestamps();

            $table->index(['athlete_id', 'expires_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('carnets');
    }
};
