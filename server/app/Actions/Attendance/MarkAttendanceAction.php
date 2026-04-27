<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

use App\Models\Academy;
use App\Models\AttendanceRecord;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;

class MarkAttendanceAction
{
    /**
     * Bulk-mark a set of athletes present on a given date for an academy.
     *
     * Contract (PRD § P0.1 & P0.2):
     *   - Idempotent — re-submitting the same payload is a no-op, never a
     *     duplicate-key error. "Present today and posted again" returns the
     *     existing row.
     *   - Soft-deleted records on the same (athlete, date) don't block a
     *     fresh insert: the default SoftDeletes scope filters tombstones,
     *     so the "already present?" check only sees active rows.
     *   - We do not enforce uniqueness at the DB level (MySQL 8 has no
     *     partial unique index). Under the single-instructor-per-session
     *     constraint (PRD non-goal #5), the app-level check here is
     *     race-safe enough; a future multi-instructor mode would need a
     *     generated-column workaround.
     *
     * Ownership is validated BEFORE this is called (by the controller /
     * FormRequest) — this action assumes every $athleteIds entry belongs
     * to $academy. Passing stale IDs silently skips them (they match no
     * academy athlete).
     *
     * @param  list<int>  $athleteIds
     * @return Collection<int, AttendanceRecord>
     */
    public function execute(Academy $academy, CarbonImmutable $date, array $athleteIds): Collection
    {
        // Restrict to athletes that actually belong to this academy (defense
        // in depth — the FormRequest should have already gated this).
        // The explicit (mixed) $v closure narrows the pluck result — which
        // PHPStan infers as mixed — back to list<int> for callers.
        $validIds = array_map(
            static fn (mixed $v): int => is_numeric($v) ? (int) $v : 0,
            $academy->athletes()->whereIn('id', $athleteIds)->pluck('id')->all(),
        );

        if ($validIds === []) {
            return collect();
        }

        // whereDate instead of where: portable across MySQL (DATE column
        // auto-truncates time) and SQLite (TEXT column, stores whatever
        // Laravel wrote — the `date:Y-m-d` cast keeps them aligned in
        // practice, but whereDate is defensive against any edge where a
        // stray timestamp lands in the column).
        $alreadyPresent = AttendanceRecord::query()
            ->whereIn('athlete_id', $validIds)
            ->whereDate('attended_on', $date->toDateString())
            ->get()
            ->keyBy('athlete_id');

        $newRecords = collect();

        foreach ($validIds as $athleteId) {
            if ($alreadyPresent->has($athleteId)) {
                // Idempotent path — surface the existing record so the
                // caller gets a uniform "here's who is now present" list.
                continue;
            }

            $newRecords->push(AttendanceRecord::create([
                'athlete_id' => $athleteId,
                'attended_on' => $date->toDateString(),
            ]));
        }

        // Return the full set of "now present" records — new + already
        // existing — so the API response shape is consistent regardless
        // of which subset was new. The controller renders this.
        return $alreadyPresent->values()->concat($newRecords);
    }
}
