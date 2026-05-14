<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Authorization\Capability;
use App\Enums\UserRole;
use App\Models\User;

/**
 * Reusable authz primitives for the multi-user epic (#427 / #720).
 *
 * Replaces the legacy `$this->user()?->academy !== null` shape across
 * every FormRequest with a `canInAcademy(academyId, capability)` gate.
 * Three flavours cover every FormRequest in the codebase:
 *
 *   - `authorizeActiveAcademy(cap)` — staff endpoint that operates on
 *     the user's currently-selected academy (no `{academy}` in URL).
 *   - `authorizeInAcademy(academyId, cap)` — staff endpoint that
 *     operates on a specific academy resolvable from a route-bound
 *     resource (e.g. `{athlete}` → `$athlete->academy_id`).
 *   - `authorizeAcademyMembership(academyId, staffCap)` — community
 *     endpoint that both staff AND athletes can hit; staff go through
 *     the capability matrix, athletes only need a tenant-scope match
 *     (athletes are NOT part of the staff capability model per PRD).
 *
 * The "active academy" resolution falls back to the user's first
 * non-revoked membership when `users.active_academy_id` is null —
 * makes the legacy single-academy flow keep working through the
 * transition without forcing every test to set the column explicitly,
 * and gives newly-bootstrapped users a sensible default until the SPA
 * calls `PATCH /me/active-academy`.
 */
trait AuthorizesAcademyCapability
{
    protected function authorizeActiveAcademy(Capability $capability): bool
    {
        /** @var User|null $user */
        $user = $this->user();
        if ($user === null) {
            return false;
        }
        $academyId = $user->activeAcademyId();
        if ($academyId === null) {
            return false;
        }

        return $user->canInAcademy($academyId, $capability);
    }

    protected function authorizeInAcademy(int $academyId, Capability $capability): bool
    {
        /** @var User|null $user */
        $user = $this->user();
        if ($user === null) {
            return false;
        }

        return $user->canInAcademy($academyId, $capability);
    }

    protected function authorizeAcademyMembership(int $academyId, Capability $staffCapability): bool
    {
        /** @var User|null $user */
        $user = $this->user();
        if ($user === null) {
            return false;
        }

        if ($user->role === UserRole::Athlete) {
            return $user->athlete?->academy_id === $academyId;
        }

        return $user->canInAcademy($academyId, $staffCapability);
    }
}
