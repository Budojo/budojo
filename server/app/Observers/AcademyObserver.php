<?php

declare(strict_types=1);

namespace App\Observers;

use App\Enums\MembershipRole;
use App\Models\Academy;
use App\Models\AcademyMembership;
use App\Models\User;

/**
 * Two responsibilities, both keyed on Academy lifecycle events:
 *
 * 1. **`created` (multi-user bootstrap, #427 / #720)** — every academy
 *    row gets a matching `Owner` membership for `academies.user_id`,
 *    and the owner's `users.active_academy_id` is set to the new
 *    academy if it wasn't already pointing somewhere. Keeps the
 *    `Academy::factory()->for($user, 'owner')` test shape working AND
 *    the production `CreateAcademyAction` path coherent without
 *    forcing every call site to repeat the bootstrap manually.
 *
 * 2. **`deleted` (#72b)** — polymorphic-orphan cleanup. The
 *    `addresses` table has no FK to its owner (price of polymorphism),
 *    so when `$academy->delete()` fires via Eloquent the morph row
 *    would otherwise survive the parent. This wipes it.
 *
 *    Caveat — DB-level FK cascades bypass Eloquent. If a User is
 *    deleted, the academy row is removed by the `cascadeOnDelete()`
 *    on `academies.user_id` at the database layer, and Eloquent
 *    observers do NOT fire for that path. Today nothing in the app
 *    deletes Users (no admin tool, no self-serve flow), so we accept
 *    that edge case; if it ever ships, swap to a User observer that
 *    walks the academy → address chain via Eloquent first.
 */
class AcademyObserver
{
    public function created(Academy $academy): void
    {
        if ($academy->user_id === 0) {
            return;
        }

        AcademyMembership::query()->firstOrCreate(
            ['user_id' => $academy->user_id, 'academy_id' => $academy->id],
            ['role' => MembershipRole::Owner, 'joined_at' => now()],
        );

        $owner = User::query()->find($academy->user_id);
        if ($owner !== null && $owner->active_academy_id === null) {
            $owner->forceFill(['active_academy_id' => $academy->id])->save();
        }
    }

    public function deleted(Academy $academy): void
    {
        $academy->address()->delete();
    }
}
