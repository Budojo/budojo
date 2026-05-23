<?php

declare(strict_types=1);

namespace App\Actions\Athlete;

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
     * @param bool $addressKeyPresent  did the caller send the `address` key at all?
     * @param array<string, mixed>|null $addressPayload  payload when present; null clears
     */
    public function execute(
        Athlete $athlete,
        array $validated,
        bool $addressKeyPresent,
        ?array $addressPayload,
    ): Athlete {
        return DB::transaction(function () use (
            $athlete,
            $validated,
            $addressKeyPresent,
            $addressPayload,
        ): Athlete {
            if ($validated !== []) {
                $athlete->update($validated);
            }
            if ($addressKeyPresent) {
                $this->syncAddress->execute($athlete, $addressPayload);
            }

            return $athlete->fresh() ?? $athlete;
        });
    }
}
