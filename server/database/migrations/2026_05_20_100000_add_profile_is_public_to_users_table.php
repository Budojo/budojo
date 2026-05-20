<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Public-profile visibility toggle (#862, M9-follow-up social-profile epic).
 *
 * Opt-out semantics — default `true` so existing users land in the visible
 * state on first migration. The Settings page (slice C follow-up) will expose
 * a toggle that flips the column to `false` for users who want their belt /
 * promotions timeline private.
 *
 * Visibility is scoped per-academy at the read layer — even when this flag
 * is `true`, cross-academy reads return 404. The flag controls whether
 * same-academy peers can see the profile, not public-internet exposure.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->boolean('profile_is_public')
                ->default(true)
                ->after('handle');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('profile_is_public');
        });
    }
};
