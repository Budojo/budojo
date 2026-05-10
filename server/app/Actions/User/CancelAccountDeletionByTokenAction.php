<?php

declare(strict_types=1);

namespace App\Actions\User;

use App\Models\PendingDeletion;
use Illuminate\Support\Carbon;

/**
 * Cancels a pending account deletion via the one-time token from the
 * confirmation email (#545, follow-up to the closed #223 umbrella).
 *
 * Sibling to {@see CancelAccountDeletionAction}, which serves the
 * authenticated `DELETE /me/deletion-request` flow when the user is
 * signed in. This Action exists for the unauthenticated entry point —
 * a click on the cancel link from the email lands on a public SPA
 * page, which posts the token here without any session context.
 *
 * Returns true when a row was actually cancelled, false when the token
 * matched nothing (idempotent: a second click on the same link, a link
 * that was never valid, and a link whose row was already purged all
 * resolve to the same false result; the controller renders one
 * "deletion is no longer pending" page either way).
 *
 * **Security posture**: the token is the sole authorization check.
 * It's a 64-char opaque random string with a unique index on the
 * column; a successful match implies the email was delivered to the
 * legitimate user. No additional rate-limiting beyond the global API
 * throttle — guessing one of these in the 30-day window without
 * intercepting the email is computationally implausible.
 *
 * **One-shot**: a successful cancel deletes the `pending_deletions`
 * row, so the same token immediately stops resolving on the next
 * call. We do NOT add a "consumed at" column or a soft-delete shape;
 * the existence of the row IS the cancellation surface.
 *
 * **Grace-window gate**: the delete is constrained to rows whose
 * `scheduled_for` is still in the future. After the cron purges the
 * account at `scheduled_for`, the cascade drops the row anyway and
 * a click resolves to false; but in the narrow race between the
 * scheduled time and the cron actually firing, an expired-window
 * click would (without this gate) still cancel the queued purge.
 * Conservative: a click after the grace window has elapsed should
 * NOT save the account — the user had 30 days, the deadline passed.
 */
class CancelAccountDeletionByTokenAction
{
    public function execute(string $token): bool
    {
        return PendingDeletion::query()
            ->where('confirmation_token', $token)
            ->where('scheduled_for', '>', Carbon::now())
            ->delete() > 0;
    }
}
