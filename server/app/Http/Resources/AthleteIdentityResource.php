<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Athlete;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * How a person is drawn on a row that is not the roster (#1851).
 *
 * The SPA draws every listed athlete with `app-athlete-identity`: the belt
 * spine, the avatar, the full name and the age chip. The roster has all of
 * that from `AthleteResource`, but the monthly summary, the leaderboard and
 * the expiring-documents list carried only a name, so they could not draw
 * the belt. This is the smallest shape the component needs, in one place, so
 * the three payloads cannot drift apart.
 *
 * `user_avatar_url` needs the `user` relation. Eager-load `user` wherever a
 * list of these is built; without it the field reads null rather than
 * costing one query per row.
 */
class AthleteIdentityResource extends JsonResource
{
    /**
     * @return array{
     *     id: int,
     *     first_name: string,
     *     last_name: string,
     *     belt: string,
     *     stripes: int,
     *     date_of_birth: string|null,
     *     photo_url: string|null,
     *     user_avatar_url: string|null,
     * }
     */
    public function toArray(Request $request): array
    {
        /** @var Athlete $athlete */
        $athlete = $this->resource;

        return [
            'id' => $athlete->id,
            'first_name' => $athlete->first_name,
            'last_name' => $athlete->last_name,
            'belt' => $athlete->belt->value,
            'stripes' => $athlete->stripes,
            'date_of_birth' => $athlete->date_of_birth?->toDateString(),
            'photo_url' => $athlete->photo_url,
            'user_avatar_url' => $athlete->relationLoaded('user') ? $athlete->user?->avatar_url : null,
        ];
    }
}
