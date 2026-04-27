<?php

declare(strict_types=1);

namespace App\Actions\Academy;

use App\Models\Academy;

/**
 * Single source of truth for the academy↔address morph relation (#72).
 * Called by both `CreateAcademyAction` and `UpdateAcademyAction` (the latter
 * differentiates "absent" from "null" before delegating, so the sentinel
 * passed here is unambiguous: `null` means "clear the address").
 *
 * **The 1:1 invariant is enforced by two things together — not by `morphOne`
 * alone.** Eloquent's `morphOne` is a read-side convenience: it returns the
 * first matching row but does NOT prevent multiple from existing. The
 * actual guarantees are:
 *
 *   1. A UNIQUE index on `(addressable_type, addressable_id)` in the
 *      `addresses` table — concurrent inserts that race past the
 *      "is there already a row?" check fail at the DB layer with a
 *      unique-violation, instead of silently producing a duplicate.
 *   2. `Address::updateOrCreate(...)` keyed on those same columns — atomic
 *      from the caller's perspective, hits the unique index on the insert
 *      branch.
 *
 * Promote to a generic `SyncAddressAction` (model-agnostic) the day a
 * second owner (athlete, instructor) needs the same upsert-or-clear
 * semantics.
 */
class SyncAcademyAddressAction
{
    /**
     * @param  array<string, mixed>|null  $payload  Validated address sub-array, or null to clear.
     */
    public function execute(Academy $academy, ?array $payload): void
    {
        if ($payload === null) {
            $academy->address?->delete();
            $academy->unsetRelation('address');

            return;
        }

        // Going through the relation (`$academy->address()->updateOrCreate`)
        // is what makes this race-safe: the relation builder pre-applies
        // `where addressable_type = ... AND addressable_id = ...` to the
        // lookup AND seeds those columns when inserting. Combined with the
        // DB-level unique index on the same columns, two concurrent PATCHes
        // can't produce duplicate rows — the second insert hits the
        // constraint instead.
        $address = $academy->address()->updateOrCreate(
            [],
            [
                'line1' => $payload['line1'] ?? null,
                'line2' => $payload['line2'] ?? null,
                'city' => $payload['city'] ?? null,
                'postal_code' => $payload['postal_code'] ?? null,
                'province' => $payload['province'] ?? null,
                'country' => $payload['country'] ?? 'IT',
            ],
        );
        $academy->setRelation('address', $address);
    }
}
