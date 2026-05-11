<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Browser Web Push subscriptions (#419). One row per device the user
 * has explicitly granted push permission on — the SPA POSTs the
 * subscription envelope (endpoint + p256dh + auth) right after
 * `PushManager.subscribe()` resolves. Server-side fanout sends a
 * push to every row tied to a target user.
 *
 * **Schema** mirrors the W3C Push API PushSubscription serialisation:
 *   - `endpoint`  → vendor-specific push service URL (FCM, Mozilla,
 *     Apple Push). Up to ~1KB in practice; varchar 1024 leaves
 *     headroom for legacy Firefox URLs.
 *   - `p256dh`    → base64url-encoded P-256 ECDH public key (~88
 *     chars after encoding).
 *   - `auth`      → base64url-encoded auth secret (~22 chars).
 *   - `last_seen_at` → bumped on a successful delivery so a future
 *     cleanup cron can purge subscriptions that haven't accepted a
 *     push in N days (zombies — uninstalled SPA, revoked permission).
 *
 * **Uniqueness** — one subscription row per (user, endpoint) pair.
 * The endpoint string is the unique device identifier the push
 * service hands out; the same browser re-subscribing reuses the URL.
 * UNIQUE on the full `endpoint` would push the index size over
 * MySQL's 3072-byte InnoDB limit; we hash and unique on the prefix
 * + user_id instead.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('push_subscriptions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')
                ->constrained('users')
                ->cascadeOnDelete();
            $table->string('endpoint', 1024);
            $table->string('endpoint_hash', 64);
            $table->string('p256dh', 255);
            $table->string('auth', 64);
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            // One subscription per (user, endpoint) pair. We hash the
            // endpoint into a 64-char SHA-256 hex string so the unique
            // index fits in the 3072-byte InnoDB row-key limit (raw
            // endpoint can be > 1000 bytes, which combined with
            // user_id overflows the limit).
            $table->unique(['user_id', 'endpoint_hash'], 'push_subscriptions_user_endpoint_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('push_subscriptions');
    }
};
