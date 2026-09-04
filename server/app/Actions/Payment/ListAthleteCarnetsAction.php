<?php

declare(strict_types=1);

namespace App\Actions\Payment;

use App\Models\Athlete;
use App\Models\Carnet;
use Illuminate\Database\Eloquent\Collection;

class ListAthleteCarnetsAction
{
    /**
     * Every carnet the athlete has ever held, newest purchase first, each
     * annotated with `entries_count` so the residual balance is derived from
     * the ledger in one query instead of an N+1 walk per carnet.
     *
     * The `id` tiebreak keeps the order stable for carnets bought on the
     * same day — back-dated sales make same-day pairs ordinary.
     *
     * @return Collection<int, Carnet>
     */
    public function execute(Athlete $athlete): Collection
    {
        return $athlete->carnets()
            ->withCount('entries')
            ->orderByDesc('purchased_at')
            ->orderByDesc('id')
            ->get();
    }
}
