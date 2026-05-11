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
                // Show only the host — the full endpoint is
                // sensitive (it's the bearer credential the push
                // vendor uses to route messages). The user recognises
                // "fcm.googleapis.com" / "updates.push.services.mozilla.com"
                // well enough to identify the device they want to revoke.
                'endpoint_host' => parse_url($s->endpoint, PHP_URL_HOST) ?: 'unknown',
                'last_seen_at' => $s->last_seen_at?->toIso8601String(),
                'created_at' => $s->created_at->toIso8601String(),
            ])->all(),
            'meta' => [
                'vapid_public_key' => config('push.vapid.public_key'),
                'enabled' => self::vapidConfigured(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        if (! self::vapidConfigured()) {
            return response()->json(
                ['message' => 'Web Push is not configured on this server.'],
                503,
            );
        }

        /** @var User $user */
        $user = $request->user();
        // `endpoint` is constrained to `https://` so a malformed
        // PushSubscription envelope can't shape-shift into an SSRF
        // vector once server-side fanout is wired — the fanout
        // worker POSTs back to this URL with a JWT signed by our
        // VAPID private key, and accepting arbitrary http/internal/
        // loopback URLs would let an authenticated user point the
        // worker at internal services. The `https_url` validator
        // accepts only well-formed https URLs.
        //
        // `keys.p256dh` / `keys.auth` carry the base64url shape from
        // the W3C PushSubscription serialisation — the `regex` rule
        // rejects anything that isn't [A-Za-z0-9_-]+ so garbage rows
        // can't slip in and fail later at signing time.
        $validated = $request->validate([
            'endpoint' => ['required', 'string', 'max:1024', 'regex:/^https:\/\//', 'url'],
            'keys' => ['required', 'array'],
            'keys.p256dh' => ['required', 'string', 'max:255', 'regex:/^[A-Za-z0-9_\-]+$/'],
            'keys.auth' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9_\-]+$/'],
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
