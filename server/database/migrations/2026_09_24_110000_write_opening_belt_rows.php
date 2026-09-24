<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Opens the promotion timeline of every athlete who existed before #1771.
 *
 * Creating an athlete now writes the belt they hold as their record begins
 * (`OpenPromotionTimelineAction`). The athletes already on a roster get the
 * same row, by the same rule: the belt held **the day their record began**
 * (`created_at`, or `joined_at` on a row that has none), dated that day.
 *
 * - **Which belt.** The one they held then, not now. If a promotion was
 *   recorded after the record began, the starting belt is that promotion's
 *   `from_belt`; only an athlete with no belt history starts at their current
 *   belt. Writing today's belt would put "started at blue" directly under the
 *   white → blue row the observer wrote in June.
 * - **Who is skipped.** An athlete whose timeline already opens — a belt row
 *   with no `from_belt`, which is what the owner writes for a "first belt" —
 *   and an athlete whose transcribed history already covers the day the
 *   record began. Adding a starting point after a history that starts earlier
 *   would only be noise.
 * - **Recorded by** the academy's owner. `recorded_by_user_id` is NOT NULL and
 *   there is no system user to attribute a migration to.
 *
 * Soft-deleted athletes are included: restoring one should bring back a
 * timeline like everyone else's.
 *
 * Idempotent: a second run finds every timeline already opened.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('athletes')
            ->join('academies', 'academies.id', '=', 'athletes.academy_id')
            ->select('athletes.id', 'athletes.belt', 'athletes.created_at', 'athletes.joined_at', 'academies.user_id as owner_id')
            ->orderBy('athletes.id')
            ->chunk(500, function ($athletes): void {
                foreach ($athletes as $athlete) {
                    $this->open($athlete);
                }
            });
    }

    /**
     * Nothing to undo reliably: an opening row written here is identical to
     * one the owner wrote as a "first belt", and deleting the owner's would be
     * data loss. The rows are true statements either way.
     */
    public function down(): void
    {
    }

    private function open(object $athlete): void
    {
        // `joined_at` is a DATE column but its cast writes `Y-m-d 00:00:00`,
        // so take the day and not the raw value.
        $began = \is_string($athlete->created_at ?? null)
            ? $athlete->created_at
            : substr((string) $athlete->joined_at, 0, 10) . ' 00:00:00';

        $beltRows = DB::table('athlete_promotions')
            ->where('athlete_id', $athlete->id)
            ->where('kind', 'belt');

        $alreadyOpens = (clone $beltRows)->whereNull('from_belt')->exists()
            || (clone $beltRows)->where('recorded_at', '<=', $began)->exists();
        if ($alreadyOpens) {
            return;
        }

        $firstPromotion = (clone $beltRows)->orderBy('recorded_at')->orderBy('id')->first();
        $belt = $firstPromotion->from_belt ?? $athlete->belt;
        $now = now()->toDateTimeString();

        DB::table('athlete_promotions')->insert([
            'athlete_id' => $athlete->id,
            'kind' => 'belt',
            'from_belt' => null,
            'to_belt' => $belt,
            'from_stripes' => null,
            'to_stripes' => null,
            'belt_at_event' => $belt,
            'recorded_at' => $began,
            'recorded_by_user_id' => $athlete->owner_id,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }
};
