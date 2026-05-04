<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;

class ResetPasswordAction
{
    /**
     * Consume a password-reset token and set a new password on the user.
     * Returns the broker's status string (`Password::PASSWORD_RESET`,
     * `Password::INVALID_TOKEN`, `Password::INVALID_USER`, etc.) so
     * the controller can map it to an HTTP status without leaking the
     * specific failure mode to the client.
     *
     * Side effects on success:
     *   1. The user's `password` column is rewritten with a fresh hash.
     *   2. A new `remember_token` is issued so any active session
     *      cookies are invalidated. (Sanctum tokens issued before the
     *      reset stay valid until their natural expiry — Sanctum has
     *      no automatic invalidation hook on password change. If we
     *      ever want session-wide logout-on-reset, that's a follow-up.)
     *   3. The matching `password_reset_tokens` row is deleted, so the
     *      same token can't be replayed.
     *   4. The `Illuminate\Auth\Events\PasswordReset` event fires —
     *      consumers (none today, kept for parity with Laravel's
     *      defaults) can hook on it.
     */
    public function execute(string $email, string $token, string $password): string
    {
        $status = Password::reset(
            [
                'email' => $email,
                'token' => $token,
                'password' => $password,
                'password_confirmation' => $password,
            ],
            function (User $user, string $password): void {
                $user->forceFill([
                    'password' => Hash::make($password),
                    'remember_token' => Str::random(60),
                ])->save();

                event(new PasswordReset($user));
            },
        );

        // The broker's signature returns `mixed` but the documented
        // contract is one of the `Password::*` status constants
        // (PASSWORD_RESET / INVALID_TOKEN / INVALID_USER / RESET_THROTTLED),
        // all of which are non-empty strings. Narrow it here so callers
        // don't have to.
        return \is_string($status) ? $status : Password::INVALID_USER;
    }
}
