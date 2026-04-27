<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\Academy;

/**
 * Polymorphic-orphan cleanup (#72b). The `addresses` table has no FK to
 * its owner (the price of going polymorphic), so when `$academy->delete()`
 * is called via Eloquent the morph row would otherwise survive the parent.
 * This observer wipes it.
 *
 * Caveat — DB-level FK cascades bypass Eloquent. If a User is deleted, the
 * academy row is removed by the `cascadeOnDelete()` on `academies.user_id`
 * at the database layer, and Eloquent observers do NOT fire for that path.
 * Today nothing in the app deletes Users (no admin tool, no self-serve
 * flow), so we accept that edge case; if it ever ships, swap to a User
 * observer that walks the academy → address chain via Eloquent first.
 */
class AcademyObserver
{
    public function deleted(Academy $academy): void
    {
        $academy->address()->delete();
    }
}
