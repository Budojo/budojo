<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\PersonalAccessToken;

/**
 * In-app password rotation (#409). Re-auth + payload validation are the
 * FormRequest's job; this action only writes the new hash and revokes
 * the user's other Sanctum tokens.
 *
 * **Token revocation rationale.** A password change should invalidate
 * other sessions (defence-in-depth: if a session was hijacked, the
 * legitimate owner rotates the credential and the attacker is logged
 * out across the board) but NOT log the user out of the tab they're
 * actively using — yanking their own session right after a successful
 * action is hostile UX and would scare them into thinking the change
 * failed. We preserve the token id used for THIS request and delete
 * every other personal-access-token row for the user.
 *
 * The current token id is read from `$user->currentAccessToken()`,
 * which Sanctum populates on the authenticated user. When called
 * outside an HTTP request (e.g. unit-style invocation) the value is
 * null and we revoke ALL tokens — the safer fallback.
 */
class ChangePasswordAction
{
    public function execute(User $user, string $newPassword): void
    {
        $user->forceFill([
            'password' => Hash::make($newPassword),
        ])->save();

        // `currentAccessToken()` returns a `PersonalAccessToken` model when
        // the user authenticated via a real Sanctum bearer (the production
        // path), a `TransientToken` placeholder under cookie-based session
        // auth, or null when invoked outside an HTTP request. Only the
        // first carries a real `id` we can preserve — the other two cases
        // mean we don't have a "current row" to keep, and the safest
        // fallback is to revoke everything (no token survives, the user
        // re-authenticates next request — that's the defence-in-depth
        // shape, slightly stricter than the happy path).
        $currentToken = $user->currentAccessToken();
        // Sanctum's `@template TToken = PersonalAccessToken` docblock makes
        // PHPStan see this instanceof as always-true. At runtime the value
        // can also be `TransientToken` (cookie-session auth) or `null`
        // (non-HTTP context); neither exposes the `getKey()` we need to
        // preserve, so the explicit check is genuine despite the static
        // analyzer's view of the world.
        /** @phpstan-ignore-next-line instanceof.alwaysTrue */
        $currentTokenId = $currentToken instanceof PersonalAccessToken
            ? $currentToken->getKey()
            : null;

        $query = $user->tokens();
        if ($currentTokenId !== null) {
            $query->where('id', '!=', $currentTokenId);
        }
        $query->delete();
    }
}
