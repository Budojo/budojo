<?php

declare(strict_types=1);

namespace App\Actions\Athlete;

use App\Actions\Address\AddressIntent;
use App\Actions\Address\SyncAddressAction;
use App\Actions\Promotion\OpenPromotionTimelineAction;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\User;
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
 *
 * The athlete's promotion timeline opens in the same transaction (#1771): an
 * athlete with no first row would read "No promotions yet" at any belt.
 * `$recordedBy` is the person creating the record — the row's
 * `recorded_by_user_id` is NOT NULL, and an Action does not reach for
 * `Auth` (server/CLAUDE.md § the Dependency Rule).
 */
class CreateAthleteAction
{
    public function __construct(
        private readonly SyncAddressAction $syncAddress,
        private readonly OpenPromotionTimelineAction $openTimeline,
    ) {
    }

    /**
     * @param Academy $academy
     * @param array<string, mixed> $validated  scalar payload — `address` already stripped
     * @param AddressIntent $address  three-way intent (only `set` mutates on Create)
     */
    public function execute(User $recordedBy, Academy $academy, array $validated, AddressIntent $address): Athlete
    {
        return DB::transaction(function () use ($recordedBy, $academy, $validated, $address): Athlete {
            /** @var Athlete $athlete */
            $athlete = $academy->athletes()->create($validated);
            if ($address->present && $address->payload !== null) {
                $this->syncAddress->execute($athlete, $address->payload);
            }
            $this->openTimeline->execute($athlete, $recordedBy);

            return $athlete;
        });
    }
}
