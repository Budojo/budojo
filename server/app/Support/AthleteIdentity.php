<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Athlete;

/**
 * An athlete as a row that lists people draws them: the belt spine, the
 * avatar, the name and the age chip — what the SPA's `app-athlete-identity`
 * reads, and nothing else (#1458).
 *
 * The reads that list people without the whole athlete — who has seen a
 * technique (#1745), what tonight's room missed (#1860) — send exactly this
 * much, written once so the two cannot drift apart. Load `user` first when
 * mapping many, or each row asks for its avatar on its own.
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
            'user_avatar_url' => $athlete->user?->avatar_url,
        ];
    }
}
