<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\LoginAttempt;
use App\Models\User;
use App\Support\UserAgentLabel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * "Login history" panel on `/dashboard/profile` (#430).
 *
 * Read-only surface over the `login_attempts` audit log. Returns
 * the most recent 50 attempts for the authenticated user — both
 * successful and failed. The user-agent string is parsed at read
 * time into the friendly device label (`Chrome on macOS`,
 * `Safari on iOS`, `Unknown device`) used elsewhere in the SPA.
 *
 * **Why 50**: balances "recent enough to spot compromise" against
 * "small enough not to scroll forever". A future "load more" CTA
 * is straightforward to add without a schema change; today, 50 is
 * generous given the 90-day retention cap.
 *
 * **No write surface here**: rows are appended exclusively by the
 * `RecordLoginAttemptAction` from the login flow.
 */
class LoginHistoryController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        /** @var \Illuminate\Database\Eloquent\Collection<int, LoginAttempt> $rows */
        $rows = LoginAttempt::query()
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get();

        $rendered = $rows
            ->map(fn (LoginAttempt $a) => [
                'id' => $a->id,
                'success' => $a->success,
                // Friendly device label parsed from the stored UA at
                // read time. Keeps the table schema-free of derived
                // values and lets a future UA-parser refinement
                // benefit historical rows on the next refetch.
                'device' => UserAgentLabel::fromUserAgent($a->user_agent ?? ''),
                'ip_address' => $a->ip_address,
                'created_at' => $a->created_at->toIso8601String(),
            ])
            ->all();

        return response()->json(['data' => $rendered]);
    }
}
