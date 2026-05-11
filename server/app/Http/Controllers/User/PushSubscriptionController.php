<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\PushSubscription;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
                // Show only the host + path prefix — the full
                // endpoint is sensitive (it's the bearer credential
                // the push vendor uses to route messages). The user
                // recognises "Chrome on macOS — fcm.googleapis.com"
                // well enough.
                'endpoint_host' => parse_url($s->endpoint, PHP_URL_HOST) ?: 'unknown',
                'last_seen_at' => $s->last_seen_at?->toIso8601String(),
                'created_at' => $s->created_at->toIso8601String(),
            ])->all(),
            'meta' => [
                'vapid_public_key' => config('push.vapid.public_key'),
                'enabled' => \is_string(config('push.vapid.public_key'))
                    && config('push.vapid.public_key') !== '',
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $vapidPublic = config('push.vapid.public_key');
        if (! \is_string($vapidPublic) || $vapidPublic === '') {
            return response()->json(
                ['message' => 'Web Push is not configured on this server.'],
                503,
            );
        }

        /** @var User $user */
        $user = $request->user();
        $validated = $request->validate([
            'endpoint' => ['required', 'string', 'url', 'max:1024'],
            'keys' => ['required', 'array'],
            'keys.p256dh' => ['required', 'string', 'max:255'],
            'keys.auth' => ['required', 'string', 'max:64'],
        ]);

        /** @var string $endpoint */
        $endpoint = $validated['endpoint'];
        /** @var array<string, string> $keys */
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
                'created_at' => $row->created_at->toIso8601String(),
            ],
        ], $row->wasRecentlyCreated ? 201 : 200);
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
}
