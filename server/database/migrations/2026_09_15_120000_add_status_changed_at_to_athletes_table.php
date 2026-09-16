<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * When an athlete's status last changed (#1741).
 *
 * `joined_at` says when someone started. Nothing said when they stopped. The
 * fact existed in exactly one form — an `athlete.updated` row in
 * `audit_entries` whose redacted `after` blob happens to carry a `status` key
 * — which is a log, not a model: not queryable, not on the wire, not on any
 * screen, and not joinable to anything.
 *
 * Nothing displays it today. The point is that without it a whole class of
 * question cannot be asked at all — how long people stay, who left this
 * season, whether an arrears figure for March should count someone who
 * stopped in February.
 *
 * **A date, not a timestamp.** The hour somebody was marked inactive is noise;
 * nobody will ever ask it, and storing it invites a display that shows it.
 *
 * **Nullable, and null is an answer**: "never changed since the row was
 * created". That is the honest and correct value for every athlete who has
 * been active since import, and it is why the column is not defaulted to
 * `created_at` — that would assert a status change that never happened.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Guarded so the backfill below can be exercised against a schema that
        // already has the column. The backfill is the half that can silently
        // do nothing, so it is the half that needs to be reachable.
        if (! Schema::hasColumn('athletes', 'status_changed_at')) {
            Schema::table('athletes', function (Blueprint $table): void {
                $table->date('status_changed_at')->nullable()->after('status');
            });
        }

        // Recover what the audit log still holds. `AthleteAuditObserver::updated`
        // writes only the CHANGED attributes into `after`, so a `status` key
        // there means the status moved in that save — unlike `athlete.created`,
        // which dumps the whole row and would date every athlete's "status
        // change" to their enrolment. Both edit verbs are matched: a save that
        // moves belt AND status is filed under `athlete.belt.promoted`.
        // (`athlete.deleted` needs no exclusion — `deleting` passes only
        // `before:`, so it can never match an `after` filter.)
        //
        // This runs once. From here the observer keeps the column in step, so
        // the audit log is never read back out again.
        $latest = DB::table('audit_entries')
            ->selectRaw('subject_id, MAX(created_at) as changed_at')
            ->where('subject_type', \App\Models\Athlete::class)
            ->whereIn('action', ['athlete.updated', 'athlete.belt.promoted'])
            ->where('after', 'like', '%"status"%')
            ->groupBy('subject_id')
            ->get();

        foreach ($latest as $row) {
            DB::table('athletes')
                ->where('id', $row->subject_id)
                ->whereNull('status_changed_at')
                // `Y-m-d H:i:s` at midnight, not a bare `Y-m-d`. Laravel's
                // plain `date` cast serialises through the grammar format, so
                // the observer — and `joined_at`, and `date_of_birth` — all
                // store `2026-09-15 00:00:00`. Writing the short form through
                // `DB::table()` (which applies no casts) would leave two string
                // shapes in one column, and SQLite compares them as text: a
                // later `where('status_changed_at', '>=', Carbon::parse($d))`
                // binds `Y-m-d H:i:s` and silently drops every backfilled row
                // on its own boundary day. Same trap as #1484's `joined_at` vs
                // `attended_on` comparison, and as #1739's expiry cutoff.
                ->update(['status_changed_at' => substr((string) $row->changed_at, 0, 10) . ' 00:00:00']);
        }
    }

    public function down(): void
    {
        Schema::table('athletes', function (Blueprint $table): void {
            $table->dropColumn('status_changed_at');
        });
    }
};
