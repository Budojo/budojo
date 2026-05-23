<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\User;
use App\Support\TwoFactorAuth;
use Illuminate\Support\Facades\DB;

/**
 * Verifies the second factor submitted alongside a successful password
 * match (#412). Accepts either a 6-digit TOTP code OR an 8-char backup
 * code (with or without the canonical dash, case-insensitive).
 *
 * Why this lives in an Action (Uncle Bob canon — Clean Architecture
 * § Use Cases): the controller used to inline this logic, including a
 * `DB::transaction(... lockForUpdate())` block. That couples HTTP
 * orchestration to a domain-level invariant ("a recovery code can be
 * consumed at most once across concurrent logins"), violates SRP, and
 * makes the consume-once invariant hard to reuse anywhere else (e.g.
 * a future "re-issue token" CLI surface).
 *
 * The TOTP path is cheap and stateless; the backup-code path runs
 * inside a row-level lock so two simultaneous logins racing with the
 * same recovery code can't both succeed. The lock + reload + persist
 * is the canonical "consume once on shared mutable state" pattern.
 */
class VerifyTwoFactorAction
{
    /**
     * @param User $user  the authenticated user whose 2FA is active
     * @param string $code  raw input from the SPA — TOTP digits or backup code
     * @return bool  true iff the code is valid; mutates `$user` in-memory so
     *                downstream Resources see the post-consume state without
     *                a second DB roundtrip on the success path
     */
    public function execute(User $user, string $code): bool
    {
        $secret = $user->two_factor_secret;
        if ($secret !== null && TwoFactorAuth::verifyTotp($secret, $code)) {
            return true;
        }

        return DB::transaction(function () use ($user, $code): bool {
            /** @var User|null $locked */
            $locked = User::query()->lockForUpdate()->find($user->id);
            if ($locked === null) {
                return false;
            }
            $codes = $locked->two_factor_recovery_codes ?? [];
            $remaining = TwoFactorAuth::consumeRecoveryCode($codes, $code);
            if ($remaining === null) {
                return false;
            }
            $locked->forceFill(['two_factor_recovery_codes' => $remaining])->save();
            // Mirror the in-memory state on the caller's reference so
            // downstream `$user` reads (e.g. UserResource) see the
            // post-consume state without a second DB roundtrip.
            $user->setRawAttributes($locked->getAttributes(), true);
            $user->exists = true;

            return true;
        });
    }
}
