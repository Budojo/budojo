<?php

declare(strict_types=1);

namespace App\Actions\Attendance;

use App\Actions\Lesson\MaterialiseLessonAction;
use App\Actions\Payment\ReconcileCarnetEntriesAction;
use App\Enums\AttendanceSource;
use App\Models\Academy;
use App\Models\AcademyClass;
use App\Models\AttendanceRecord;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class MarkAttendanceAction
{
    public function __construct(
        private readonly ReconcileCarnetEntriesAction $reconcileCarnets,
        private readonly MaterialiseLessonAction $materialiseLesson,
    ) {
    }

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
     * to $academy, and that $academyClass, when given, is one of its
     * classes. Passing stale IDs silently skips them (they match no
     * academy athlete).
     *
     * The `source` parameter pins who marked the presence. Defaults to
     * `Instructor` for back-compat with the owner-side widget; the
     * athlete-side `POST /me/attendance/today` endpoint passes `Self`.
     *
     * **With a class (#1562)** the presence is recorded into that class's
     * lesson for the day — created here on the first tap, reused after. The
     * unit of idempotency becomes (athlete, date, lesson): the same athlete
     * can be in the kids' class at 17:00 and the adults' at 19:00, and that is
     * two rows. A presence recorded on the day with no lesson — every row
     * from before the timetable existed, any day the academy has no class,
     * and the athlete's own self-mark, which knows no class — still counts as
     * "already present" for every class of that day, so a Monday from last
     * spring does not read as empty once Monday has a timetable. Without a
     * class, nothing changes from before.
     *
     * @param  list<int>  $athleteIds
     * @return Collection<int, AttendanceRecord>
     */
    public function execute(
        Academy $academy,
        CarbonImmutable $date,
        array $athleteIds,
        AttendanceSource $source = AttendanceSource::Instructor,
        ?AcademyClass $academyClass = null,
    ): Collection {
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

        // One transaction over the lesson, the inserts and the reconciliation:
        // a presence recorded without its ledger catching up is exactly the
        // drift the derived-balance design exists to prevent, and a lesson
        // that exists with nobody in it because the inserts failed would be a
        // smaller version of the same lie.
        /** @var Collection<int, AttendanceRecord> $present */
        $present = DB::transaction(function () use ($validIds, $date, $source, $academyClass): Collection {
            $lessonId = $academyClass !== null
                ? $this->materialiseLesson->execute($academyClass, $date)->id
                : null;

            // whereDate instead of where: portable across MySQL (DATE column
            // auto-truncates time) and SQLite (TEXT column, stores whatever
            // Laravel wrote — the `date:Y-m-d` cast keeps them aligned in
            // practice, but whereDate is defensive against any edge where a
            // stray timestamp lands in the column).
            $alreadyPresent = AttendanceRecord::query()
                ->whereIn('athlete_id', $validIds)
                ->whereDate('attended_on', $date->toDateString())
                ->when($lessonId !== null, static fn ($q) => $q->where(
                    static fn ($q) => $q->whereNull('lesson_id')->orWhere('lesson_id', $lessonId),
                ))
                ->get()
                ->keyBy('athlete_id');

            /** @var Collection<int, AttendanceRecord> $newRecords */
            $newRecords = collect();

            foreach ($validIds as $athleteId) {
                if ($alreadyPresent->has($athleteId)) {
                    // Idempotent path — surface the existing record so the
                    // caller gets a uniform "here's who is now present" list.
                    // Re-marking cannot double-charge: the reconciliation below
                    // derives the ledger from the sessions that exist, and this
                    // branch adds none.
                    continue;
                }

                $newRecords->push(AttendanceRecord::create([
                    'athlete_id' => $athleteId,
                    'lesson_id' => $lessonId,
                    'attended_on' => $date->toDateString(),
                    'source' => $source,
                ]));
            }

            // Reconciled rather than charged (#1380): what a carnet pays for is
            // a function of its window, so the whole athlete is recomputed rather
            // than this one presence being debited.
            $this->reconcileCarnets->execute(array_values($validIds));

            // Return the full set of "now present" records — new + already
            // existing — so the API response shape is consistent regardless
            // of which subset was new. The controller renders this.
            return $alreadyPresent->values()->concat($newRecords);
        });

        return $present;
    }
}
