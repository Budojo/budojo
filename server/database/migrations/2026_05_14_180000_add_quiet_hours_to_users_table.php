<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-user quiet hours for Web Push delivery (#729 Phase A3).
 *
 * Both columns are TINYINT UNSIGNED (0..23) representing the wall-clock
 * hour in the **application timezone** (`config('app.timezone')` — today
 * `Europe/Rome` for the v2.x Italy-only rollout). They're a window
 * descriptor, not an absolute timestamp, so storing the hour alone is
 * enough; the dispatcher resolves the current local hour against
 * `Carbon::now(config('app.timezone'))` at delivery time. Per-user
 * timezone (`users.timezone` column) is a future enhancement —
 * tracked for #271 multi-market expansion when we ship outside IT.
 *
 * Both NULL = quiet hours OFF (the default, GDPR soft-opt-in posture).
 * Both filled = the inclusive-start, exclusive-end window during which
 * Web Push delivery is suppressed; inbox + email channels are
 * unaffected. A window crossing midnight (e.g. 22 → 8) is legal — the
 * dispatcher uses modular arithmetic.
 *
 * The dispatcher enforces this as a delivery-time check inside
 * `WebPushChannel::send()` — the Notification class never knows it
 * was suppressed (inbox writes still happen so the user catches up
 * when the window ends).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->unsignedTinyInteger('quiet_hours_start_local')
                ->nullable()
                ->after('active_academy_id');
            $table->unsignedTinyInteger('quiet_hours_end_local')
                ->nullable()
                ->after('quiet_hours_start_local');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn(['quiet_hours_start_local', 'quiet_hours_end_local']);
        });
    }
};
