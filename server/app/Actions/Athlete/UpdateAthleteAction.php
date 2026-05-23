<?php

declare(strict_types=1);

namespace App\Actions\Athlete;

use App\Actions\Address\AddressIntent;
use App\Actions\Address\SyncAddressAction;
use App\Models\Athlete;
use Illuminate\Support\Facades\DB;

/**
 * Updates an existing athlete row (#988 — controller-bloat extraction).
 * Honours the three-way semantics on `address` (#72b):
 *
 * - key absent → no change to the existing morph row
 * - key present + value `null` → delete the morph row
 * - key present + array → upsert (create or replace in place)
 *
 * Wraps scalar update + address mutation in a single `DB::transaction`
 * so a downstream failure rolls back BOTH halves (no half-applied
 * update where the name changed but the address didn't, or vice versa).
 */
class UpdateAthleteAction
{
    public function __construct(
        private readonly SyncAddressAction $syncAddress,
    ) {
    }

    /**
     * @param Athlete $athlete  the bound athlete to mutate
     * @param array<string, mixed> $validated  scalar payload — `address` already stripped
     * @param AddressIntent $address  three-way intent on the address morph (skip / clear / set)
     */
    public function execute(
        Athlete $athlete,
        array $validated,
        AddressIntent $address,
    ): Athlete {
        return DB::transaction(function () use ($athlete, $validated, $address): Athlete {
            if ($validated !== []) {
                $athlete->update($validated);
            }
            if ($address->present) {
                $this->syncAddress->execute($athlete, $address->payload);
            }

            return $athlete->fresh() ?? $athlete;
        });
    }
}
