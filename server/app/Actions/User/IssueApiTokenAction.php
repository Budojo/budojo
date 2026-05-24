<?php

declare(strict_types=1);

namespace App\Actions\User;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\NewAccessToken;

/**
 * Mints a new API-kind Sanctum token (#994 — controller-bloat
 * extraction).
 *
 * Wraps the create + the `kind` stamp in a single `DB::transaction`
 * so a crash between the two queries can't leak a token marked
 * `kind = 'session'` (which would surface in `/me/sessions` and risk
 * being wiped by "revoke other sessions"). Atomic
 * either-both-or-neither is the right contract.
 *
 * Why this lives in an Action (Uncle Bob canon — Clean Architecture):
 * the controller used to inline both validation AND the transaction.
 * The validation now lives in `IssueApiTokenRequest`, the
 * transaction here. Controller stays thin.
 */
class IssueApiTokenAction
{
    /**
     * @param User $user  the authenticated user issuing the token
     * @param string $name human-readable label surfaced in `/me/api-tokens`
     * @param list<string> $abilities  whitelist of Sanctum abilities
     * @param ?int $expiresInDays  null → no expiry, otherwise N days from now
     */
    public function execute(
        User $user,
        string $name,
        array $abilities,
        ?int $expiresInDays,
    ): NewAccessToken {
        $expiresAt = $expiresInDays !== null ? now()->addDays($expiresInDays) : null;

        return DB::transaction(function () use ($user, $name, $abilities, $expiresAt): NewAccessToken {
            $minted = $user->createToken(
                name: $name,
                abilities: $abilities,
                expiresAt: $expiresAt,
            );
            $minted->accessToken->forceFill(['kind' => 'api'])->save();

            return $minted;
        });
    }
}
