<?php

declare(strict_types=1);

namespace App\Actions\Academy;

use App\Models\Academy;
use Illuminate\Support\Facades\DB;

class UpdateAcademyAction
{
    public function __construct(
        private readonly SyncAcademyAddressAction $syncAddress,
    ) {
    }

    /**
     * Partial update: only keys present in $validated are applied. The slug
     * is immutable by design and is never touched here — renames keep the
     * original permalink stable (see UpdateAcademyRequest::rules() comment).
     *
     * Address (#72) is handled separately because it lives on a polymorphic
     * relation, not a column on the academy row. The PATCH semantics are:
     *   - `address` key absent from `$validated` → no change
     *   - `address` is `null` → delete the existing address row
     *   - `address` is an array → upsert (create or replace)
     *
     * `update()` hydrates the academy's scalar attributes in-memory before
     * persisting, so those are in sync with the DB on return. The address
     * relation is kept in sync by `SyncAcademyAddressAction`, which calls
     * `setRelation('address', ...)` (or `unsetRelation` on null-clear) on
     * the same instance. No `fresh()` round-trip is needed — both layers
     * mutate the in-memory model deliberately.
     *
     * @param  array<string, mixed>  $validated  Output of FormRequest::validated()
     */
    public function execute(Academy $academy, array $validated): Academy
    {
        return DB::transaction(function () use ($academy, $validated): Academy {
            $addressKeyPresent = \array_key_exists('address', $validated);
            $addressPayload = $validated['address'] ?? null;
            unset($validated['address']);

            if ($validated !== []) {
                $academy->update($validated);
            }

            if ($addressKeyPresent) {
                /** @var array<string, mixed>|null $payload */
                $payload = \is_array($addressPayload) ? $addressPayload : null;
                $this->syncAddress->execute($academy, $payload);
            }

            return $academy;
        });
    }
}
