<?php

declare(strict_types=1);

namespace App\Actions\Athlete;

use App\Models\Academy;
use App\Models\Athlete;
use Illuminate\Support\Collection;

/**
 * The athletes behind an aggregate's rows, in one query (#1851).
 *
 * The monthly summary and the leaderboard count presences with a grouped
 * query, which yields ids and names but no models. To draw each row with the
 * belt (`AthleteIdentityResource`), the controller needs the athletes
 * themselves. This loads them once, not once per row, with `user` eager-loaded
 * for the avatar.
 *
 * Scoped to the academy, so an id that is not one of its athletes returns
 * nothing rather than someone else's person.
 */
class LoadAthleteIdentitiesAction
{
    /**
     * @param  iterable<array-key, int>  $athleteIds
     * @return Collection<int, Athlete> keyed by athlete id
     */
    public function execute(Academy $academy, iterable $athleteIds): Collection
    {
        $ids = collect($athleteIds)->unique()->values()->all();

        if ($ids === []) {
            return collect();
        }

        return Athlete::query()
            ->where('academy_id', $academy->id)
            ->whereIn('id', $ids)
            ->with('user')
            ->get()
            ->keyBy('id');
    }
}
