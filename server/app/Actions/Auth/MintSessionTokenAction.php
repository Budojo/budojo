<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Enums\TokenKind;
use App\Models\User;

/**
 * Mints the bearer token a sign-in hands back (#1227).
 *
 * Login and register both did `$user->createToken($label)` inline and left the
 * kind at its `session` default. The desktop profile needs its sign-in tokens
 * distinguishable (`kind = desktop`) so the shell's stored credential can be
 * listed and revoked individually — one place decides, both callers share it.
 */
final class MintSessionTokenAction
{
    public function execute(User $user, string $deviceLabel): string
    {
        $minted = $user->createToken($deviceLabel);
        $minted->accessToken->forceFill(['kind' => TokenKind::forSignIn()->value])->save();

        return $minted->plainTextToken;
    }
}
