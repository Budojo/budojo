<?php

declare(strict_types=1);

namespace App\Actions\Document;

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
     * The `athlete` relation is eager-loaded so the API resource can include
     * the athlete identity without N+1. Result size is capped at MAX_RESULTS.
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

        return $through
            ->whereNotNull('documents.expires_at')
            ->where('documents.expires_at', '<=', $cutoff)
            ->with('athlete')
            ->orderBy('documents.expires_at', 'asc')
            ->limit(self::MAX_RESULTS)
            ->get();
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
            ->where('status', 'active')
            ->whereDoesntHave('documents', fn ($q) => $q->where('type', DocumentType::MedicalCertificate->value))
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->limit(self::MAX_RESULTS)
            ->get();
    }
}
