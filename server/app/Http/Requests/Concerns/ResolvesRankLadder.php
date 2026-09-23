<?php

declare(strict_types=1);

namespace App\Http\Requests\Concerns;

use App\Enums\MartialArt;
use App\Models\Athlete;
use App\Support\MartialArt\MartialArtProfile;
use App\Support\MartialArt\RankLadder;

/**
 * The ladder a request's belts are judged against (#1800): the route-bound
 * athlete's academy when there is one, the caller's active academy otherwise —
 * the same choice every athlete request already makes for its capability check,
 * so a caller switched to academy A cannot validate a belt in academy B against
 * A's ladder.
 *
 * `authorize()` runs before `rules()`, so the academy is always there by the
 * time this is asked. The BJJ fallback only answers the type system; it is also
 * the column default, so it is the honest reading of a row that predates it.
 */
trait ResolvesRankLadder
{
    protected function rankLadder(): RankLadder
    {
        $athlete = $this->route('athlete');
        $academy = $athlete instanceof Athlete ? $athlete->academy : $this->user()?->activeAcademy();

        return MartialArtProfile::for($academy->martial_art ?? MartialArt::Bjj)->ladder();
    }
}
