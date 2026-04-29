<?php

declare(strict_types=1);

namespace App\Actions\User;

use App\Models\User;

/**
 * Cancels a pending account deletion (#223). Called either via the
 * authenticated UI ("nope, keep my account"), or via a one-time
 * confirmation_token link from the deletion-confirmation email.
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
