<?php

declare(strict_types=1);

namespace App\Actions\Account;

use App\Exceptions\EmailChangeTokenInvalidException;
use App\Models\Athlete;
use App\Models\PendingEmailChange;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Apply a verified email change (#476). Called by the public
 * `POST /email-change/{token}/verify` endpoint when the user clicks
 * the link in the verification mail. Three things happen
 * transactionally:
 *
 * 1. `users.email` is set to `pending.new_email`.
 * 2. `users.email_verified_at` is set to `now()` — the click is the
 *    proof the new address is reachable, exactly like the M5 verify-
 *    email flow does for first-time registration.
 * 3. If the user has a linked `Athlete` row (state-C path), its
 *    `email` column is synced to the new value. Without this the
 *    athletes roster would drift from the user's actual login email.
 * 4. The pending row is deleted in the same transaction. Single-use
 *    token — a second click on the same link 410s because the row no
 *    longer exists.
 *
 * Failure modes (all collapse to `EmailChangeTokenInvalidException`,
 * which the controller renders as 410 Gone):
 *
 * - Hash unknown — the token was never issued, OR the row was already
 *   consumed by a previous click.
 * - Row found but expired — `expires_at` in the past.
 * - User no longer exists — FK cascade should prevent this; defensive
 *   guard.
 *
 * The exception class deliberately collapses these three cases: the
 * SPA's user-facing remedy is the same in all three (request a fresh
 * link), and differentiating would only leak signal to a probing
 * attacker.
 */
class ConfirmEmailChangeAction
{
    /**
     * @return User the user with the freshly-applied email
     */
    public function execute(string $rawToken): User
    {
        $hash = PendingEmailChange::hashToken($rawToken);

        return DB::transaction(function () use ($hash): User {
            /** @var PendingEmailChange|null $pending */
            $pending = PendingEmailChange::query()
                ->where('token', $hash)
                ->lockForUpdate()
                ->first();

            if ($pending === null) {
                throw new EmailChangeTokenInvalidException('invalid_or_expired_link');
            }

            if ($pending->isExpired()) {
                // Drop the stale row eagerly; the scheduled cleanup
                // would have eventually got it, but the lock is in our
                // hand right now and the row can never be useful.
                $pending->delete();
                throw new EmailChangeTokenInvalidException('invalid_or_expired_link');
            }

            /** @var User|null $user */
            $user = User::query()->whereKey($pending->user_id)->lockForUpdate()->first();
            if ($user === null) {
                $pending->delete();
                throw new EmailChangeTokenInvalidException('invalid_or_expired_link');
            }

            $newEmail = $pending->new_email;

            $user->forceFill([
                'email' => $newEmail,
                // The click validates the new address as deliverable
                // and owned by the legitimate user — that's the same
                // proof the M5 verify-email flow needs. Stamp it so
                // gated endpoints don't re-bounce the user.
                'email_verified_at' => now(),
            ])->save();

            // State-C path sync (#476). When the user is linked to an
            // athlete row, keep `athletes.email` in lock-step with the
            // login email — without this the roster card would
            // diverge from "this is how the athlete signs in". The
            // `whereKey` is on `user_id` because the `Athlete` schema
            // carries a nullable FK there (M7 #445).
            Athlete::query()
                ->where('user_id', $user->id)
                ->update(['email' => $newEmail]);

            // Single-use token: drop the row so a refresh / browser-
            // back / shared-link replay 410s on the next attempt.
            $pending->delete();

            return $user->fresh() ?? $user;
        });
    }
}
