<?php

declare(strict_types=1);

namespace App\Actions\Me;

use App\Models\Academy;
use App\Models\User;

/**
 * Resolve the academy the authenticated user belongs to (#618, M7
 * PR-D slice 2).
 *
 * Returns the **caller's own academy** regardless of role:
 *
 * - **Staff** (Owner persona — i.e. anyone with at least one
 *   AcademyMembership): the user's active academy resolved via
 *   `User::activeAcademy()`. Honours the multi-user
 *   `users.active_academy_id` pointer with the legacy single-
 *   membership fallback baked into the helper.
 * - **Athlete**: the academy on their linked `athletes` row (via
 *   `User->athlete->academy`).
 * - **No academy**: returns `null` — the controller renders 404.
 */
class GetMyAcademyAction
{
    public function execute(User $user): ?Academy
    {
        if ($user->isOwner()) {
            return $user->activeAcademy();
        }

        return $user->athlete?->academy;
    }
}
