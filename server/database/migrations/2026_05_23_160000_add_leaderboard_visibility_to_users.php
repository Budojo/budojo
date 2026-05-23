<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            // Per-user opt-out for the monthly mat-hours leaderboard
            // (#962). Default `true` — landing-state visible. Flipping
            // to `false` anonymises the row on the card ("Anonimo")
            // but the user's sessions still count toward rank
            // computation so the order is faithful.
            $table->boolean('leaderboard_visible')
                ->default(true)
                ->after('attendance_peer_visible');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('leaderboard_visible');
        });
    }
};
