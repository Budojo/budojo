<?php

declare(strict_types=1);

namespace App\Actions\Document;

use App\Models\Academy;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\Relations\HasManyThrough;
use Illuminate\Support\Carbon;

class GetExpiringDocumentsAction
{
    /**
     * Return every document in the academy whose `expires_at` is either in the
     * past OR within the next `$days` days. Results are ordered by `expires_at`
     * ascending (most urgent first). Documents with `expires_at = null` are
     * excluded — "no expiry" is handled separately by the UI badge logic.
     *
     * The `athlete` relation is eager-loaded so the API resource can include
     * the athlete identity without N+1.
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
            ->get();
    }
}
