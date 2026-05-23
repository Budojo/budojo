<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Actions\User\IssueApiTokenAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\User\IssueApiTokenRequest;
use App\Models\User;
use App\Support\ApiTokenAbility;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
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
    public function __construct(
        private readonly IssueApiTokenAction $issueApiToken,
    ) {
    }

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

    public function store(IssueApiTokenRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        /** @var array{name: string, abilities: list<string>, expires_in_days?: int|null} $validated */
        $validated = $request->validated();

        $newToken = $this->issueApiToken->execute(
            user: $user,
            name: $validated['name'],
            abilities: $validated['abilities'],
            expiresInDays: $validated['expires_in_days'] ?? null,
        );

        $abilities = $validated['abilities'];
        $row = $newToken->accessToken;

        return response()->json([
            'data' => [
                'id' => $row->id,
                'name' => $row->name,
                'abilities' => $abilities,
                // `last_used_at` matches the index endpoint's shape so
                // the SPA can splice the response row straight into the
                // list without a follow-up GET. Freshly-minted = null.
                'last_used_at' => null,
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
