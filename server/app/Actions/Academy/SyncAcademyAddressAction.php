<?php

declare(strict_types=1);

namespace App\Actions\Academy;

use App\Models\Academy;
use App\Models\Address;

/**
 * Single source of truth for the academy↔address morph relation (#72).
 * Called by both `CreateAcademyAction` and `UpdateAcademyAction` (the latter
 * differentiates "absent" from "null" before delegating, so the sentinel
 * passed here is unambiguous: `null` means "clear the address").
 *
 * The `morphOne` relation enforces the 1:1 invariant — calling `save()` on
 * an existing instance updates in place, calling it on a new instance
 * replaces the previous row via `delete()` first. Promote to a generic
 * `SyncAddressAction` (model-agnostic) the day a second owner (athlete,
 * instructor) needs the same upsert-or-clear semantics.
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

        $address = $academy->address ?? new Address();
        $address->fill([
            'line1' => $payload['line1'] ?? null,
            'line2' => $payload['line2'] ?? null,
            'city' => $payload['city'] ?? null,
            'postal_code' => $payload['postal_code'] ?? null,
            'province' => $payload['province'] ?? null,
            'country' => $payload['country'] ?? 'IT',
        ]);
        $academy->address()->save($address);
        $academy->setRelation('address', $address->fresh());
    }
}
