<?php

declare(strict_types=1);

namespace App\Actions\Academy;

use App\Actions\Address\SyncAddressAction;
use App\Models\Academy;
use Illuminate\Database\QueryException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

class UpdateAcademyAction
{
    public function __construct(
        private readonly SyncAddressAction $syncAddress,
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
     * relation is kept in sync by `SyncAddressAction`, which calls
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

            // Schedule history (#1094). Touching `training_days` via the
            // canonical PATCH is treated as "this is the schedule starting
            // today" — insert a new row instead of (or in addition to)
            // mutating the denormalised cache column on `academies`. The
            // current-day row is upserted by (academy_id, effective_from)
            // so a same-day double-PATCH replaces the row instead of
            // hitting the UNIQUE constraint. PR 2 will add a dedicated
            // schedule-change endpoint that allows a future
            // `effective_from`; for now PATCH always lands on today.
            $trainingDaysKeyPresent = \array_key_exists('training_days', $validated);
            if ($trainingDaysKeyPresent) {
                /** @var list<int>|null $trainingDays */
                $trainingDays = $validated['training_days'];
                $this->upsertTodaySchedule($academy, $trainingDays);
            }

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

    /**
     * Race-safe upsert of the today-row in `academy_schedules`. The
     * read-then-write shape of `updateOrCreate` against the
     * `UNIQUE(academy_id, effective_from)` constraint isn't serialised
     * by the enclosing transaction — two concurrent PATCHes from the
     * same user (double-tap on Save, SPA retry after a 502) can both
     * SELECT-miss, both INSERT, and one explodes with a
     * UniqueConstraintViolation. Try the insert, fall through to an
     * UPDATE on the duplicate-key path — second write wins,
     * idempotently. Same shape as the gotchas-flagged `addresses`
     * upsert.
     *
     * @param  list<int>|null  $trainingDays
     */
    private function upsertTodaySchedule(Academy $academy, ?array $trainingDays): void
    {
        $today = Carbon::today()->toDateString();

        try {
            $academy->schedules()->create([
                'training_days' => $trainingDays,
                'effective_from' => $today,
            ]);
        } catch (QueryException) {
            $academy->schedules()
                ->where('effective_from', $today)
                ->update(['training_days' => $trainingDays]);
        }
    }
}
