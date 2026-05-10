<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\ApiTokenAbility;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * API-tokens surface (#431). Lets the user mint long-lived,
 * user-named, abilities-scoped Sanctum tokens for integrations
 * (e.g. a nightly script that exports the roster).
 *
 * Distinct from `/me/sessions` (#413) — session tokens carry the
 * `*` ability and are surfaced for revocation only. API tokens
 * are user-created via `POST /me/api-tokens`, get a scoped
 * abilities list, and surface with the plaintext value ONCE on
 * creation.
 *
 * **Three endpoints**:
 *  - `GET /me/api-tokens`  → list (no plaintext, just metadata).
 *  - `POST /me/api-tokens` → mint; response includes the plaintext
 *    token ONCE. The plain string is unrecoverable from the DB.
 *  - `DELETE /me/api-tokens/{id}` → revoke.
 *
 * **Ownership** — every action narrows on `$user->id` so a probe
 * with a guessed integer id never touches another user's token.
 * Same shape as the `/me/sessions/{id}` flow.
 */
class ApiTokenController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        /** @var \Illuminate\Database\Eloquent\Collection<int, PersonalAccessToken> $tokens */
        $tokens = PersonalAccessToken::query()
            ->where('tokenable_type', User::class)
            ->where('tokenable_id', $user->id)
            ->where('kind', 'api')
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'data' => $tokens->map(static function (PersonalAccessToken $t): array {
                /** @var array<int, string>|null $abilities */
                $abilities = $t->abilities;

                return [
                    'id' => $t->id,
                    'name' => $t->name,
                    'abilities' => $abilities ?? [],
                    'last_used_at' => $t->last_used_at?->toIso8601String(),
                    'expires_at' => $t->expires_at?->toIso8601String(),
                    'created_at' => $t->created_at?->toIso8601String(),
                ];
            })->all(),
            'meta' => [
                'available_abilities' => ApiTokenAbility::all(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'abilities' => ['required', 'array', 'min:1'],
            'abilities.*' => ['string', Rule::in(ApiTokenAbility::all())],
            'expires_in_days' => ['nullable', 'integer', 'min:1', 'max:730'],
        ]);

        /** @var array<int, string> $abilities */
        $abilities = $validated['abilities'];
        /** @var ?int $expiresInDays */
        $expiresInDays = $validated['expires_in_days'] ?? null;
        $expiresAt = $expiresInDays !== null ? now()->addDays($expiresInDays) : null;

        $newToken = $user->createToken(
            name: $validated['name'],
            abilities: $abilities,
            expiresAt: $expiresAt,
        );

        // Stamp the token row with `kind = 'api'` so `/me/sessions`
        // doesn't accidentally surface it. `createToken` doesn't take
        // a kind arg directly — patch the row right after.
        $newToken->accessToken->forceFill(['kind' => 'api'])->save();

        $row = $newToken->accessToken;

        return response()->json([
            'data' => [
                'id' => $row->id,
                'name' => $row->name,
                'abilities' => $abilities,
                'expires_at' => $row->expires_at?->toIso8601String(),
                'created_at' => $row->created_at?->toIso8601String(),
                // PLAINTEXT — returned once. The SPA must surface it
                // immediately with a "copy + you won't see this again"
                // warning. Once dismissed, this string is unrecoverable.
                'plain_text_token' => $newToken->plainTextToken,
            ],
        ], 201);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $deleted = PersonalAccessToken::query()
            ->where('tokenable_type', User::class)
            ->where('tokenable_id', $user->id)
            ->where('kind', 'api')
            ->where('id', $id)
            ->delete();

        if ($deleted === 0) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        return response()->json(['data' => ['revoked' => true]]);
    }
}
