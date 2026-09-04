<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('carnet_entries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('carnet_id')->constrained()->cascadeOnDelete();
            // One attendance can never consume two entries: the unique index
            // is the structural guarantee, which is why no pessimistic lock
            // is needed around consumption. Same shape as the unique index
            // behind `RecordAthletePaymentAction`.
            $table->foreignId('attendance_record_id')->unique()->constrained()->cascadeOnDelete();
            // Denormalised copy of `attendance_records.attended_on` so the
            // ledger reads without joining attendance.
            $table->date('used_on');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('carnet_entries');
    }
};
