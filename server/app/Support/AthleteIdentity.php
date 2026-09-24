<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Athlete;

/**
 * How a person is drawn on a row that is not the roster (#1851): the belt
 * spine, the avatar, the full name and the age chip — what the SPA's
 * `app-athlete-identity` reads, and nothing else.
 *
 * The one place this shape is written. `AthleteIdentityResource` hands it to
 * the controllers that list people (the monthly summary, the leaderboard, the
 * expiring documents); the Actions that list people themselves — who has
 * seen a technique (#1745), what tonight's room missed (#1860) — call it
 * directly, because an Action does not reach into the HTTP layer.
 *
 * `user_avatar_url` needs the `user` relation. Eager-load `user` wherever a
 * list of these is built; without it the field reads null rather than
 * costing one query per row.
 */
final class AthleteIdentity
{
    /**
     * @return array{id: int, first_name: string, last_name: string, belt: string, stripes: int, date_of_birth: string|null, photo_url: string|null, user_avatar_url: string|null}
     */
    public static function of(Athlete $athlete): array
    {
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
