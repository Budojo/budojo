<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Athlete;
use App\Support\AthleteIdentity;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * How a person is drawn on a row that is not the roster (#1851).
 *
 * The SPA draws every listed athlete with `app-athlete-identity`: the belt
 * spine, the avatar, the full name and the age chip. The roster has all of
 * that from `AthleteResource`, but the monthly summary, the leaderboard and
 * the expiring-documents list carried only a name, so they could not draw
 * the belt.
 *
 * The shape itself is {@see AthleteIdentity::of()}, which the Actions that
 * list people (#1745, #1860) call directly; this resource is the HTTP layer's
 * door to the same shape, so the payloads cannot drift apart.
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

        return AthleteIdentity::of($athlete);
    }
}
