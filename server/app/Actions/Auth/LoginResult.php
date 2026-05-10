<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\User;

/**
 * Outcome of a `LoginUserAction::execute` call (#430 follow-up).
 *
 * Carries both the authenticated `User` (when credentials match) and
 * the matched-by-email user_id even when the password check failed —
 * so the login-history audit log can attribute a wrong-password
 * attempt to the targeted account without a second DB query in the
 * controller. The previous shape returned just `User|null` and the
 * controller did its own `User::query()->where('email')` lookup on
 * failure, doubling the high-volume failed-login query path.
 *
 * **Why a value object over a tuple/array**: typed properties survive
 * a refactor and PHPStan reads the shape without docblock plumbing;
 * the controller doesn't need to remember which array index meant
 * what.
 */
final class LoginResult
{
    public function __construct(
        /** Authenticated user when credentials matched; null on any failure. */
        public readonly ?User $user,
        /**
         * The id of the user whose email was queried, regardless of
         * whether the password matched. Null only when the email
         * doesn't match any registered user.
         */
        public readonly ?int $matchedUserId,
    ) {
    }

    public function isSuccess(): bool
    {
        return $this->user !== null;
    }
}
