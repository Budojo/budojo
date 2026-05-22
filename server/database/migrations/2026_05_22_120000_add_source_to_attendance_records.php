<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance_records', function (Blueprint $table): void {
            // Who marked the presence — backfilled to 'instructor' for
            // every existing row (every row before #960 was created via
            // the owner-side widget). New rows from the athlete-side
            // self-mark endpoint pin 'self'.
            $table->enum('source', ['instructor', 'self'])
                ->default('instructor')
                ->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('attendance_records', function (Blueprint $table): void {
            $table->dropColumn('source');
        });
    }
};
