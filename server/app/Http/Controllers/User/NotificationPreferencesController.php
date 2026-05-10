<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\NotificationCategory;
use App\Support\NotificationPreferences;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

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

    public function update(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        // Validation: shape is `preferences: { <category>: bool }`.
        // The `Rule::array(allowed-keys)` rule restricts the keys to
        // the catalog so a malformed request fails fast with 422 and
        // the offending key named — easier to debug than the helper's
        // silent-drop fallback (kept as a defense-in-depth belt).
        $validated = $request->validate([
            'preferences' => [
                'required',
                'array',
                Rule::array(NotificationCategory::all()),
            ],
            'preferences.*' => ['boolean'],
        ]);

        /** @var array<string, bool> $patch */
        $patch = $validated['preferences'];
        NotificationPreferences::update($user, $patch);

        // Echo the full snapshot back so the SPA can refresh its
        // local state with one request, no follow-up GET.
        $rendered = [];
        foreach (NotificationCategory::all() as $category) {
            $rendered[$category] = NotificationPreferences::isEnabled($user->refresh(), $category);
        }

        return response()->json(['data' => $rendered]);
    }
}
