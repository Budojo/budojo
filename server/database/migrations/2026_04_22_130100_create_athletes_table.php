<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('athletes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('academy_id')->constrained()->cascadeOnDelete();
            $table->string('first_name');
            $table->string('last_name');
            $table->string('email')->nullable();
            $table->string('phone', 30)->nullable();
            $table->date('date_of_birth')->nullable();
            $table->string('belt');
            $table->unsignedTinyInteger('stripes')->default(0);
            $table->string('status');
            $table->date('joined_at');
            $table->timestamps();
            $table->softDeletes();

            $table->unique(['academy_id', 'email']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('athletes');
    }
};
