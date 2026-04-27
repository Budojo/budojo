<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\Academy;

/**
 * Polymorphic-orphan cleanup (#72b). The `addresses` table has no FK to
 * its owner (the price of going polymorphic), so when an academy is
 * deleted — directly or via the cascade from `users.user_id` — the address
 * row would otherwise survive the parent. This observer wipes it.
 *
 * The hook is `deleted` (not `deleting`) because the academy row itself
 * cascades from a parent FK; running BEFORE that cascade lands would race
 * with it. Running AFTER guarantees the academy is gone, then we tidy up
 * the dependent.
 */
class AcademyObserver
{
    public function deleted(Academy $academy): void
    {
        $academy->address()->delete();
    }
}
