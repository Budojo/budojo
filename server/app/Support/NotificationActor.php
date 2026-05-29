<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\User;

/**
 * Builds the `actor` block of an in-app notification's database payload
 * (#1131) — the person who triggered it, surfaced as the avatar + name on
 * the notifications page (#1129). A tiny dependency-free helper (not a
 * service) so every Notification class shapes the actor identically.
 */
final class NotificationActor
{
    /**
     * @return array{name: string, avatar_url: string|null}
     */
    public static function fromUser(User $user): array
    {
        return [
            'name' => trim($user->first_name . ' ' . $user->last_name),
            'avatar_url' => $user->avatar_url,
        ];
    }
}
