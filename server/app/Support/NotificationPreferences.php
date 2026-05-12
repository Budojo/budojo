<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\User;

/**
 * Read/write helper over `users.notification_preferences` (#416).
 *
 * The column is a nullable JSON object keyed by category string.
 * Default posture is **opt-in** (absent key → enabled) — mirrors
 * the GDPR soft-opt-in stance from M5: existing users at deploy
 * time don't suddenly stop receiving digests, and a new category
 * ships enabled-by-default until the user actively opts out.
 *
 * **Exception**: categories listed in `NotificationCategory::defaultOff()`
 * flip the absent-key fallback to disabled — used for wide-radius
 * fanouts (e.g. every-athlete-in-academy broadcasts) where an
 * explicit opt-in is the right posture.
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
        $defaultEnabled = ! \in_array($category, NotificationCategory::defaultOff(), true);

        if (! \is_array($prefs)) {
            return $defaultEnabled;
        }

        // Absent key → category's default. Present `true`/`false` →
        // trust the stored boolean. Any other unexpected value (the
        // string `'false'`, an int, an array, …) falls through to
        // the category default — corrupt JSON shouldn't accidentally
        // silence (or invent) a user's notifications. The SPA panel
        // only ever PATCHes booleans, so the corrupt-data branch is
        // purely defensive.
        $value = $prefs[$category] ?? null;

        if ($value === true) {
            return true;
        }
        if ($value === false) {
            return false;
        }

        return $defaultEnabled;
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
