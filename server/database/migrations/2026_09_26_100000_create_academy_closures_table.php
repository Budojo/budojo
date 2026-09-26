<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // The days the academy is shut (#1766): August, Christmas, a seminar
        // weekend. Whole days, inclusive at both ends, so a single day is a
        // range that starts and ends on it. Overlaps are allowed and mean
        // nothing more: a day is either shut or it is not. They only ever
        // take days out of the scheduled ones (`App\Support\ScheduledDays`).
        Schema::create('academy_closures', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('academy_id')->constrained()->cascadeOnDelete();
            $table->date('starts_on');
            $table->date('ends_on');
            $table->string('label', 80)->nullable();
            $table->timestamps();

            $table->index(['academy_id', 'starts_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('academy_closures');
    }
};
