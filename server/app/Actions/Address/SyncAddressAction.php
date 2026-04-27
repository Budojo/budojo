<?php

declare(strict_types=1);

namespace App\Actions\Address;

use App\Contracts\HasAddress;
use Illuminate\Database\Eloquent\Model;

/**
 * Single source of truth for the polymorphic address upsert-or-clear (#72).
 * Replaces `App\Actions\Academy\SyncAcademyAddressAction` from #72a — that
 * one was always intended to generalise, and athletes (#72b) are the
 * second implementor that justifies the move.
 *
 * **The 1:1 invariant is enforced by two layers together — not by `morphOne`
 * alone.** Eloquent's `morphOne` is a read-side convenience: it returns the
 * first matching row but does NOT prevent multiple from existing. The
 * actual guarantees are:
 *
 *   1. A UNIQUE index on `(addressable_type, addressable_id)` in the
 *      `addresses` table — concurrent inserts that race past the
 *      "is there already a row?" check fail at the DB layer with a
 *      unique-violation, instead of silently producing a duplicate.
 *   2. Going through the relation's `updateOrCreate(...)` — atomic from the
 *      caller's perspective, hits the unique index on the insert branch.
 */
class SyncAddressAction
{
    /**
     * @param  HasAddress&Model           $owner    Intersection: the contract narrows the method, the Model side gives us setRelation / unsetRelation.
     * @param  array<string, mixed>|null  $payload  Validated address sub-array, or null to clear.
     */
    public function execute(HasAddress&Model $owner, ?array $payload): void
    {
        if ($payload === null) {
            // `$owner->address()->delete()` issues a DELETE on the relation
            // query (no need to hydrate the model first), and works even
            // when the relation isn't loaded yet — `$owner->address?->delete()`
            // would silently no-op on a fresh instance.
            $owner->address()->delete();
            $owner->unsetRelation('address');

            return;
        }

        // Going through the relation (`$owner->address()->updateOrCreate`)
        // is what makes this race-safe: the relation builder pre-applies
        // `where addressable_type = ... AND addressable_id = ...` to the
        // lookup AND seeds those columns when inserting. Combined with the
        // DB-level unique index on the same columns, two concurrent writes
        // (PUT, PATCH, seeder, anything that lands here) can't produce
        // duplicate rows — the second insert hits the constraint instead.
        $address = $owner->address()->updateOrCreate(
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
        $owner->setRelation('address', $address);
    }
}
