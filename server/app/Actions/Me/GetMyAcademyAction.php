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
 * - **Owner**: their owned academy (via `User->academy`).
 * - **Athlete**: the academy on their linked `athletes` row (via
 *   `User->athlete->academy`).
 * - **No academy**: returns `null` — the controller renders 404.
 *
 * This is a deliberately separate read-path from `AcademyController::show`
 * which is owner-only (assumes `User->academy` is non-null). Athletes
 * never own an academy, so the controller couldn't be shared without a
 * branching flag — easier to keep two slim entry points.
 */
class GetMyAcademyAction
{
    public function execute(User $user): ?Academy
    {
        if ($user->isOwner()) {
            return $user->academy;
        }

        return $user->athlete?->academy;
    }
}
