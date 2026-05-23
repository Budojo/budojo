<?php

declare(strict_types=1);

namespace App\Actions\Athlete;

use App\Actions\Address\AddressIntent;
use App\Actions\Address\SyncAddressAction;
use App\Models\Academy;
use App\Models\Athlete;
use Illuminate\Support\Facades\DB;

/**
 * Creates a new athlete row inside the academy (#988 — controller-bloat
 * extraction). Wraps the scalar create + the optional address-morph
 * upsert in a single `DB::transaction` so a downstream failure rolls
 * back the athlete row too (no orphaned rows on a partial commit).
 *
 * Why this lives in an Action (Uncle Bob canon — Clean Architecture
 * § Use Cases): the controller used to inline the transaction + the
 * address splice. That couples HTTP orchestration to a multi-step
 * domain operation. The Action exposes a single `execute()` so a
 * future non-HTTP caller (a CLI import, a batch enrolment) can land
 * the same invariant with no code duplication.
 *
 * Uses the same `AddressIntent` value object as `UpdateAthleteAction`
 * for parameter parity (Clean Code § flag args + sibling-Action
 * consistency). On Create both `skip` and `clear` collapse to "do
 * nothing" — there's no prior morph row to delete.
 */
class CreateAthleteAction
{
    public function __construct(
        private readonly SyncAddressAction $syncAddress,
    ) {
    }

    /**
     * @param Academy $academy
     * @param array<string, mixed> $validated  scalar payload — `address` already stripped
     * @param AddressIntent $address  three-way intent (only `set` mutates on Create)
     */
    public function execute(Academy $academy, array $validated, AddressIntent $address): Athlete
    {
        return DB::transaction(function () use ($academy, $validated, $address): Athlete {
            /** @var Athlete $athlete */
            $athlete = $academy->athletes()->create($validated);
            if ($address->present && $address->payload !== null) {
                $this->syncAddress->execute($athlete, $address->payload);
            }

            return $athlete;
        });
    }
}
