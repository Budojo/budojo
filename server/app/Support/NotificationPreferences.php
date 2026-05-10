<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\User;

/**
 * Read/write helper over `users.notification_preferences` (#416).
 *
 * The column is a nullable JSON object keyed by category string. A
 * `null` column or an absent key means **enabled** (default-opt-in)
 * — only an explicit `false` opts the user out. Mirrors the GDPR
 * soft-opt-in posture: existing users at deploy time don't suddenly
 * stop receiving digests, and a future new category ships
 * enabled-by-default until the user actively opts out.
 *
 * Centralising the read here means the dispatchers don't reach into
 * the raw array shape — easier to evolve the schema (move to a
 * dedicated table, add a per-category schedule, etc.) without
 * touching every gate.
 */
final class NotificationPreferences
{
    public static function isEnabled(User $user, string $category): bool
    {
        $prefs = $user->notification_preferences;

        if (! \is_array($prefs)) {
            return true;
        }

        // Absent key → default-opt-in. Present key → respect the
        // boolean exactly. We DO NOT coerce truthy strings or numbers
        // because the SPA panel only ever PATCHes `true` / `false`;
        // anything else is corrupt data and should be treated as
        // "default enabled".
        $value = $prefs[$category] ?? null;

        return $value === null || $value === true;
    }

    /**
     * Merge a partial preferences map into the user's existing JSON
     * and persist. Only known categories are accepted; an unknown
     * key is silently ignored so a malformed PATCH can't pollute the
     * column with arbitrary keys.
     *
     * @param array<string, bool> $patch
     */
    public static function update(User $user, array $patch): void
    {
        $current = \is_array($user->notification_preferences)
            ? $user->notification_preferences
            : [];

        foreach ($patch as $category => $enabled) {
            if (! \in_array($category, NotificationCategory::all(), true)) {
                continue;
            }
            $current[$category] = (bool) $enabled;
        }

        $user->notification_preferences = $current;
        $user->save();
    }
}
