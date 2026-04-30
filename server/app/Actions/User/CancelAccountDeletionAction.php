<?php

declare(strict_types=1);

namespace App\Actions\User;

use App\Models\User;

/**
 * Cancels a pending account deletion (#223). Drives the authenticated
 * "nope, keep my account" UI flow — `DELETE /me/deletion-request` —
 * and that's it for now. The token-based "click here to cancel"
 * email-link flow lives behind the `confirmation_token` column on
 * `pending_deletions` and will land as a separate Action / endpoint
 * once the deletion-request email is implemented (TODO follow-up
 * tracked on #223).
 *
 * Returns true when something was actually cancelled, false when
 * the user had nothing pending — so the controller can shape the
 * response correctly without a second query.
 */
class CancelAccountDeletionAction
{
    public function execute(User $user): bool
    {
        return $user->pendingDeletion()->delete() > 0;
    }
}
