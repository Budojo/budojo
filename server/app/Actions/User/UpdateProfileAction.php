<?php

declare(strict_types=1);

namespace App\Actions\User;

use App\Models\User;

/**
 * Update the editable fields on the authenticated user's own profile (#463).
 *
 * Currently scoped to `name` only — the email-change half of the
 * original #410 splits out into its own flow (pending-email-changes
 * schema + signed-verification round-trip + banner UX) and lands
 * separately. Keeping this action small + focused means each user-
 * editable field arrives with its own validation / audit / UX.
 */
class UpdateProfileAction
{
    public function execute(User $user, string $name): User
    {
        $user->update(['name' => $name]);

        return $user;
    }
}
