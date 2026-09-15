<?php

declare(strict_types=1);

namespace App\Actions\Document;

use App\Enums\AthleteStatus;
use App\Enums\DocumentType;
use App\Models\Academy;
use App\Models\Athlete;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;
use Illuminate\Support\Carbon;

class GetExpiringDocumentsAction
{
    /**
     * Hard cap on the number of rows returned. The endpoint is consumed by
     * a dashboard widget whose UX breaks anyway past a few dozen entries —
     * an academy with hundreds of simultaneously-expiring documents needs a
     * different UI. Capping here prevents accidentally-huge responses. If a
     * future full "expiring report" needs paginated results, that's its own
     * endpoint.
     */
    private const int MAX_RESULTS = 200;

    /**
     * Return every document in the academy whose `expires_at` is either in the
     * past OR within the next `$days` days. Results are ordered by `expires_at`
     * ascending (most urgent first). Documents with `expires_at = null` are
     * excluded — "no expiry" is handled separately by the UI badge logic.
     *
     * A medical certificate a later one has replaced is excluded too
     * (`Document::scopeNotSuperseded`, #1739). This list answers "who needs
     * chasing", and the owner holding a valid 2027 certificate is not being
     * asked about the 2026 one it replaced — which otherwise sat here in red
     * for the full 24 months until the purge took it.
     *
     * **Active athletes only** (#1740), which is what `missingMedicalCertificate()`
     * below has always said and what this method did not: one envelope cannot
     * hold two definitions of who counts. An inactive athlete is not asked for
     * a certificate, so their lapsed paperwork is not an alarm — it stays on
     * their own documents tab, where it is history rather than a task.
     *
     * **The academy's own papers are included** (#1743), merged in from a
     * second query and re-sorted, because they hang off the academy directly
     * and the athlete join cannot reach them. They carry no athlete, and the
     * active-athlete scope above does not apply to them — an academy's
     * liability policy does not have a training status.
     *
     * The `athlete` relation is eager-loaded so the API resource can include
     * the athlete identity without N+1. Result size is capped at MAX_RESULTS,
     * applied to the MERGED list.
     *
     * @return Collection<int, \App\Models\Document>
     */
    public function execute(Academy $academy, int $days = 30): Collection
    {
        $cutoff = Carbon::today()->addDays($days)->toDateString();

        /** @var HasManyThrough<\App\Models\Document, \App\Models\Athlete, \App\Models\Academy> $through */
        $through = $academy->hasManyThrough(
            \App\Models\Document::class,
            \App\Models\Athlete::class,
            'academy_id',
            'athlete_id',
        );

        $athleteDocuments = $through
            ->where('athletes.status', AthleteStatus::Active->value)
            ->whereNotNull('documents.expires_at')
            // `whereDate`, not `where` — the `date` cast on the model writes
            // `2026-10-15 00:00:00` while `$cutoff` is the bare `2026-10-15`,
            // and SQLite compares those as text, so a document expiring on
            // exactly `today + days` sorted AFTER the cutoff and vanished:
            // `days=30` hid it, `days=31` showed it. The T-30 digest uses
            // `whereDate` and never had the bug, so the owner got an email
            // that morning about a certificate this widget did not list.
            ->whereDate('documents.expires_at', '<=', $cutoff)
            ->notSuperseded()
            ->with('athlete')
            ->orderBy('documents.expires_at', 'asc')
            ->limit(self::MAX_RESULTS)
            ->get();

        // The academy's own papers are not reachable through the athlete join
        // (#1743) — `athlete_id` is null on them — so they are a second query,
        // merged and re-sorted here.
        //
        // **The cap applies to the merge, not to each half.** Two queries each
        // taking 200 can return 400 rows, and capping each at 100 would hide
        // urgent athlete certificates behind an academy's paperwork or the
        // other way round. Each half still carries the cap so neither can pull
        // an unbounded set out of the database; the merge then re-applies it
        // to what the caller actually receives.
        $academyDocuments = $academy->documents()
            ->whereNotNull('expires_at')
            ->whereDate('expires_at', '<=', $cutoff)
            ->orderBy('expires_at', 'asc')
            ->limit(self::MAX_RESULTS)
            ->get();

        /** @var Collection<int, \App\Models\Document> $merged */
        $merged = $athleteDocuments
            ->concat($academyDocuments)
            // `id` after the date, so two documents expiring on the same day
            // come back in the same order on every call. Without it a tied
            // block reorders between requests, and the dashboard widget's
            // "most urgent first" becomes "whichever the database felt like".
            ->sortBy([['expires_at', 'asc'], ['id', 'asc']])
            ->take(self::MAX_RESULTS)
            ->values();

        return $merged;
    }

    /**
     * Active athletes in the academy with NO live medical-certificate row.
     * "Live" excludes soft-deleted rows. Active means status='active' —
     * suspended / inactive athletes don't need a cert.
     *
     * An athlete with an EXPIRED but non-trashed medical cert is NOT
     * counted here — they already surface via `execute()` above.
     *
     * @return Collection<int, Athlete>
     */
    public function missingMedicalCertificate(Academy $academy): Collection
    {
        return $academy->athletes()
            ->where('status', AthleteStatus::Active->value)
            ->whereDoesntHave('documents', fn ($q) => $q->where('type', DocumentType::MedicalCertificate->value))
            ->orderBy('first_name_sort')
            ->orderBy('last_name_sort')
            ->orderBy('id')
            ->limit(self::MAX_RESULTS)
            ->get();
    }
}
