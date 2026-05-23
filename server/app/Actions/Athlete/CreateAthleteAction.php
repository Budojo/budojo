<?php

declare(strict_types=1);

namespace App\Actions\Athlete;

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
     * @param array<string, mixed>|null $addressPayload  upsert the morph row when present
     */
    public function execute(Academy $academy, array $validated, ?array $addressPayload): Athlete
    {
        return DB::transaction(function () use ($academy, $validated, $addressPayload): Athlete {
            /** @var Athlete $athlete */
            $athlete = $academy->athletes()->create($validated);
            if ($addressPayload !== null) {
                $this->syncAddress->execute($athlete, $addressPayload);
            }

            return $athlete;
        });
    }
}
