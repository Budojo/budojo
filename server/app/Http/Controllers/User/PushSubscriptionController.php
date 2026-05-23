<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Http\Requests\User\StorePushSubscriptionRequest;
use App\Models\PushSubscription;
use App\Models\User;
use App\Notifications\TestPushNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;

/**
 * Web Push subscription surface (#419). Backs the "Browser
 * notifications" toggle on `/dashboard/profile`. Three concerns:
 *
 *  - **`GET /me/push-subscriptions`** — list the user's active rows
 *    (no key material exposed, just endpoint metadata for "your
 *    devices" management) + the VAPID public key the SPA needs to
 *    call `PushManager.subscribe()`.
 *  - **`POST /me/push-subscriptions`** — accept the
 *    `PushSubscription.toJSON()` envelope from the SPA. Idempotent
 *    upsert via (user_id, endpoint_hash).
 *  - **`DELETE /me/push-subscriptions/{id}`** — revoke a single row.
 *    Mirrors the active-sessions revoke shape; 404 on cross-user ids.
 */
class PushSubscriptionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $rows = PushSubscription::query()
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'data' => $rows->map(static fn (PushSubscription $s): array => [
                'id' => $s->id,
                // Show only the host — the full endpoint is
                // sensitive (it's the bearer credential the push
                // vendor uses to route messages). The user recognises
                // "fcm.googleapis.com" / "updates.push.services.mozilla.com"
                // well enough to identify the device they want to revoke.
                'endpoint_host' => parse_url($s->endpoint, PHP_URL_HOST) ?: 'unknown',
                // SHA-256 hash of the endpoint URL (#822). Exposed so
                // the SPA can match the current browser's
                // `sha256(PushSubscription.endpoint)` against the
                // device list — needed to render a "(this device)"
                // pill on the matching row AND to hide the
                // "Add another device" affordance when the current
                // device is already subscribed. The hash is NOT a
                // bearer credential (the endpoint URL is); exposing
                // it is safe.
                'endpoint_hash' => $s->endpoint_hash,
                'last_seen_at' => $s->last_seen_at?->toIso8601String(),
                'created_at' => $s->created_at->toIso8601String(),
            ])->all(),
            'meta' => [
                'vapid_public_key' => config('push.vapid.public_key'),
                'enabled' => self::vapidConfigured(),
            ],
        ]);
    }

    public function store(StorePushSubscriptionRequest $request): JsonResponse
    {
        if (! self::vapidConfigured()) {
            return response()->json(
                ['message' => 'Web Push is not configured on this server.'],
                503,
            );
        }

        /** @var User $user */
        $user = $request->user();
        // SSRF gate + payload-shape validation now lives in
        // `StorePushSubscriptionRequest` — the rule grep-resolves
        // from a single dedicated file the moment a future security
        // audit reaches for it (server canon § FormRequest discipline).
        /** @var array{endpoint: string, keys: array<string, string>} $validated */
        $validated = $request->validated();
        $endpoint = $validated['endpoint'];
        $keys = $validated['keys'];

        // Idempotent upsert: re-subscribing the same browser hits the
        // same (user, endpoint_hash) pair and refreshes the keys.
        $row = PushSubscription::updateOrCreate(
            [
                'user_id' => $user->id,
                'endpoint_hash' => hash('sha256', $endpoint),
            ],
            [
                'endpoint' => $endpoint,
                'p256dh' => $keys['p256dh'],
                'auth' => $keys['auth'],
            ],
        );

        return response()->json([
            'data' => [
                'id' => $row->id,
                'endpoint_host' => parse_url($row->endpoint, PHP_URL_HOST) ?: 'unknown',
                // Without this the SPA's "(this device)" pill + "Add another device" hide stay false until a GET re-fetch (#822 intent was instant matching after subscribe).
                'endpoint_hash' => $row->endpoint_hash,
                'created_at' => $row->created_at->toIso8601String(),
            ],
        ], $row->wasRecentlyCreated ? 201 : 200);
    }

    /**
     * User-triggered test push (#819). Fires a one-shot `TestPushNotification`
     * via `WebPushChannel` to the calling user's stored subscriptions, so
     * the user can self-verify their device's push channel is healthy
     * (and we have a one-tap diagnostic affordance for support).
     *
     * 422 when the user has zero subscriptions — without an existing
     * device, there's nothing to test against. 503 when the underlying
     * fan-out throws (e.g. VAPID misconfig at delivery time, vendor
     * signing failure inside `WebPushChannel::send → $webPush->flush()`).
     * Without the catch a runtime throw bubbles as a generic 500
     * (#828) — the structured 503 + logged context lets the SPA show a
     * specific toast and lets us correlate from server logs.
     *
     * The "Send test" button on the SPA is gated on the device list so
     * the 422 is defensive, not the user-flow path. Quiet hours
     * suppression is inherited from `WebPushChannel`.
     */
    public function test(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! $user->pushSubscriptions()->exists()) {
            return response()->json([
                'message' => 'No push subscriptions registered for this user.',
            ], 422);
        }

        try {
            Notification::send($user, new TestPushNotification());
        } catch (\Throwable $e) {
            // Monolog serializes the full stack trace only when context carries a Throwable under the reserved 'exception' key.
            Log::warning('TestPushNotification dispatch threw', [
                'user_id' => $user->id,
                'exception' => $e,
            ]);

            return response()->json([
                'message' => 'Could not dispatch the test notification.',
                'reason' => 'dispatch_failed',
            ], 503);
        }

        return response()->json(['data' => ['sent' => true]]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $deleted = PushSubscription::query()
            ->where('user_id', $user->id)
            ->whereKey($id)
            ->delete();

        if ($deleted === 0) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        return response()->json(['data' => ['revoked' => true]]);
    }

    /**
     * "Web Push is fully configured" is BOTH keys + a subject set.
     * Checking only the public key (the early shape of this gate)
     * would let the SPA subscribe successfully but every server-side
     * push would fail at signing — the wrong place for the user-
     * visible error to surface. All three pieces gate the meta.enabled
     * flag AND the store() 503 branch.
     */
    private static function vapidConfigured(): bool
    {
        $pub = config('push.vapid.public_key');
        $priv = config('push.vapid.private_key');
        $sub = config('push.vapid.subject');

        return \is_string($pub) && $pub !== ''
            && \is_string($priv) && $priv !== ''
            && \is_string($sub) && $sub !== '';
    }
}
