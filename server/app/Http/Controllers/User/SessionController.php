<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * "Active sessions" surface for the authenticated user (#413).
 *
 * Lists every Sanctum personal-access-token (PAT) row tied to the
 * user, lets them revoke any individual session, and provides a
 * one-click "revoke all OTHER sessions" CTA for the
 * password-was-just-changed and laptop-was-stolen scenarios.
 *
 * **No auth bypass on revoke-current.** A user can call
 * `DELETE /me/sessions/{id}` with the id of the token they are
 * currently authenticated with — the row is deleted, the next
 * request from that tab gets 401, the SPA's auth interceptor
 * bounces them to /auth/login. No redirect server-side; the SPA
 * handles the boot.
 *
 * **Ownership enforcement.** Every action narrows by `$user->id` so
 * a malicious caller cannot revoke another user's session by
 * guessing PAT IDs (Sanctum issues sequential ints).
 */
class SessionController extends Controller
{
    /**
     * GET /me/sessions — every PAT row tied to the user, newest
     * `last_used_at` first so the active devices float to the top.
     * The `is_current` flag in each row marks the token used to
     * authenticate THIS request.
     */
    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        // `currentAccessToken()` is annotated `@return TToken` by
        // Sanctum (with TToken = PersonalAccessToken), but at runtime
        // it can be EITHER a `PersonalAccessToken` (real Bearer auth)
        // OR a `Laravel\Sanctum\TransientToken` (test paths via
        // `Sanctum::actingAs($user)` / `$this->actingAs($user)`).
        // The TransientToken has no `id`, so we narrow with
        // `instanceof` and fall back to `null` when the request is
        // authenticated but no PAT row backs it.
        $current = $user->currentAccessToken();
        // @phpstan-ignore-next-line instanceof.alwaysTrue (Sanctum's @return is misleading; runtime can return TransientToken or null)
        $currentId = $current instanceof PersonalAccessToken ? $current->id : null;

        /** @var \Illuminate\Database\Eloquent\Collection<int, PersonalAccessToken> $tokens */
        $tokens = $user->tokens()
            ->orderByRaw('COALESCE(last_used_at, created_at) DESC')
            ->get();

        $rendered = $tokens
            ->map(fn (PersonalAccessToken $t) => [
                'id' => $t->id,
                // Device label set at token-creation time by
                // `UserAgentLabel` (e.g. "Chrome on macOS",
                // "Safari on iOS"). Older tokens minted before #413
                // still carry the legacy `auth` /
                // `athlete-invite-accept` strings — those are
                // self-explanatory enough not to warrant a one-shot
                // backfill migration.
                'name' => $t->name,
                'last_used_at' => $t->last_used_at?->toIso8601String(),
                'created_at' => $t->created_at?->toIso8601String(),
                // Stamp the row that authenticated THIS request so
                // the SPA can render the "this session" pill. The
                // shape inlined here intentionally — a JsonResource
                // can't see request-context state through
                // `additional()` on a collection (it only attaches
                // to the outer envelope), so a Resource buys nothing
                // for the small projection.
                'is_current' => $t->id === $currentId,
            ])
            ->all();

        return response()->json(['data' => $rendered]);
    }

    /**
     * DELETE /me/sessions/{id} — revoke a single PAT. Returns 204
     * on success, 404 when the id doesn't belong to the user (the
     * same shape as a never-existed id, so a probe can't enumerate
     * other users' token IDs by status code).
     */
    public function destroy(Request $request, int $id): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $deleted = $user->tokens()->whereKey($id)->delete();

        if ($deleted === 0) {
            return response()->json(['message' => 'Session not found.'], 404);
        }

        return response()->json(null, 204);
    }

    /**
     * DELETE /me/sessions — revoke every OTHER session, keep the
     * current one. The "logout everywhere except here" pattern.
     * Returns 200 with the count of revoked rows so the SPA can
     * flash a confirmation toast.
     */
    public function destroyOthers(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $current = $user->currentAccessToken();
        // See the analogous comment in `index()` — the runtime type
        // can be `PersonalAccessToken`, `TransientToken`, or null,
        // even though Sanctum's @return suggests otherwise. When the
        // request is NOT authenticated by a real PAT (TransientToken
        // / null — only happens in test paths via `actingAs` since
        // the auth:sanctum middleware requires a token in
        // production), refuse to revoke ANYTHING: a falsy "current"
        // id with `id != 0` matches every token and would wipe all
        // of the user's sessions, the opposite of "keep current".
        // @phpstan-ignore-next-line instanceof.alwaysTrue
        if (! $current instanceof PersonalAccessToken) {
            return response()->json(['data' => ['revoked' => 0]]);
        }

        $revoked = $user->tokens()
            ->where('id', '!=', $current->id)
            ->delete();

        return response()->json(['data' => ['revoked' => $revoked]]);
    }
}
