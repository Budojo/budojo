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
            // Opt-out flag for the peer-preview row on the
            // self-mark attendance page (#958). Default `true` so
            // existing rows land in the visible state. Flipping to
            // `false` hides the user from peers viewing the page —
            // the user's own attendance row is still created and
            // counted toward leaderboard / streak aggregates, only
            // the avatar+handle on the peer preview is suppressed.
            $table->boolean('attendance_peer_visible')
                ->default(true)
                ->after('profile_is_public');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('attendance_peer_visible');
        });
    }
};
