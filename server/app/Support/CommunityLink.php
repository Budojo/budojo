<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\User;

/**
 * Builds the in-app deep-link to a community post for a notification
 * recipient (#1071).
 *
 * Owners and athletes read the SAME community feed through DIFFERENT
 * routes: owners at `/dashboard/community`, athletes at the
 * `roleAthleteGuard`-protected `/dashboard/me/feed`. The seven
 * community notifications used to hardcode the athlete route, so an
 * owner tapping any of them failed the guard and landed on the 404.
 * Centralising the role split here keeps all seven in lock-step.
 */
final class CommunityLink
{
    public static function forPost(User $recipient, int $postId): string
    {
        $base = $recipient->isAthlete() ? '/dashboard/me/feed' : '/dashboard/community';

        return \sprintf('%s#post-%d', $base, $postId);
    }
}
