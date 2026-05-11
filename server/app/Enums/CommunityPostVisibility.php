<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Audience scope of a community post (#600, M9). V1 ships only
 * `Academy` — every read query is `WHERE academy_id = ?`. The `Public`
 * value is reserved from day 1 so V2 cross-academy discovery (mappa +
 * eventi pubblici) doesn't need a destructive migration.
 *
 * V2 will introduce a discovery surface for posts marked `public`;
 * until then the value can be stored but is never queried.
 */
enum CommunityPostVisibility: string
{
    case Academy = 'academy';
    case Public = 'public';
}
