<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Http\Requests\User\UpdateNotificationPreferencesRequest;
use App\Models\User;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Per-category email-notification preferences (#416). Read + write
 * over `users.notification_preferences` (a nullable JSON column).
 *
 * **GET** returns the full snapshot of toggleable categories with
 * their current boolean state. Default-opt-in: a category not
 * explicitly stored in the JSON resolves to `true`. Transactional
 * categories (welcome / password-reset / email-verification /
 * account-deletion / athlete-invitation) are NOT surfaced here —
 * they are non-negotiable; the SPA panel labels them as
 * "always sent" in a separate read-only block.
 *
 * **PATCH** accepts a partial map of `{category: bool}` and merges.
 * Unknown categories are silently dropped by the helper so a
 * malformed request can't pollute the column with arbitrary keys.
 */
class NotificationPreferencesController extends Controller
{
    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $rendered = [];
        foreach (NotificationCategory::all() as $category) {
            $rendered[$category] = NotificationPreferences::isEnabled($user, $category);
        }

        return response()->json(['data' => $rendered]);
    }

    public function update(UpdateNotificationPreferencesRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        /** @var array{preferences: array<string, bool>} $validated */
        $validated = $request->validated();
        $patch = $validated['preferences'];
        NotificationPreferences::update($user, $patch);

        // Refresh ONCE before the loop, reuse the hydrated instance
        // for every category lookup. The prior shape called
        // `$user->refresh()` inside the foreach, triggering a DB
        // query per category that would scale linearly as the
        // catalog grows.
        $user->refresh();
        $rendered = [];
        foreach (NotificationCategory::all() as $category) {
            $rendered[$category] = NotificationPreferences::isEnabled($user, $category);
        }

        return response()->json(['data' => $rendered]);
    }
}
