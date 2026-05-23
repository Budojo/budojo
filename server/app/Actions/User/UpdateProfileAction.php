<?php

declare(strict_types=1);

namespace App\Actions\User;

use App\Models\User;

/**
 * Update the editable fields on the authenticated user's own profile
 * (#463 + #479). Three fields after #479: `first_name`, `last_name`,
 * `handle`.
 *
 * Email change is the dedicated `/me/email-change` flow (#476), NOT
 * this action — keeping each editable field on its own request +
 * validation + UX path.
 *
 * Handle is lowercased on save so the UNIQUE storage index is
 * effectively case-insensitive: typing `MaTtEo` in the form persists
 * as `matteo`, and `Matteo` from a second user collides with the
 * existing `matteo` row at the DB level.
 */
class UpdateProfileAction
{
    public function execute(
        User $user,
        string $firstName,
        string $lastName,
        ?string $handle,
        ?bool $attendancePeerVisible = null,
    ): User {
        $patch = [
            'first_name' => $firstName,
            'last_name' => $lastName,
            'handle' => $handle === null ? null : mb_strtolower($handle),
        ];
        // Only mutate the toggle when the caller explicitly sent it —
        // preserves the existing value on partial PATCHes that omit
        // the field.
        if ($attendancePeerVisible !== null) {
            $patch['attendance_peer_visible'] = $attendancePeerVisible;
        }
        $user->update($patch);

        return $user;
    }
}
