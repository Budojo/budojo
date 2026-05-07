<?php

declare(strict_types=1);

namespace App\Actions\Account;

use App\Models\User;

/**
 * Cancel an outstanding email-change request for the authenticated
 * user (#476). Drops the `pending_email_changes` row if one exists;
 * idempotent (a double-click returns the same shape — 0 rows
 * affected and no error). Mirrors the shape of `CancelAccountDeletionAction`.
 *
 * No mail goes out on cancel — the user is right here pressing the
 * button, the audit channel (the OLD email) was already notified at
 * request time and would only get noisier from a second mail.
 */
class CancelPendingEmailChangeAction
{
    public function execute(User $user): void
    {
        $user->pendingEmailChange()->delete();
    }
}
