<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Notifications\DatabaseNotification;

/**
 * In-app notification inbox surface (#418). Three endpoints backing
 * the bell-icon dropdown in the dashboard topbar:
 *
 *  - **`GET /me/notifications`** — last 20 rows + unread count for
 *    badge. Returns the projected wire shape the SPA renders one
 *    row per (title / body / link / read_at / created_at).
 *  - **`POST /me/notifications/{id}/read`** — flip a single row to
 *    read. 404s when the id doesn't belong to the authenticated
 *    user — uniform with `/me/sessions/{id}` semantics so a probe
 *    can't enumerate other users' notification ids by status.
 *  - **`POST /me/notifications/read-all`** — bulk mark every unread
 *    row read. Returns the count that was flipped.
 */
class NotificationInboxController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        /** @var \Illuminate\Database\Eloquent\Collection<int, DatabaseNotification> $rows */
        $rows = $user->notifications()
            ->orderByDesc('created_at')
            ->limit(20)
            ->get();

        $unread = $user->unreadNotifications()->count();

        return response()->json([
            'data' => $rows->map(static function (DatabaseNotification $n): array {
                // The Notification's toDatabase() return is in `data`.
                // Project a flat shape that mirrors what the SPA renders.
                /** @var array<string, mixed> $data */
                $data = $n->data;
                $title = $data['title'] ?? '';
                $body = $data['body'] ?? '';
                $link = $data['link'] ?? null;
                $kind = $data['kind'] ?? null;
                $actor = $data['actor'] ?? null;

                return [
                    'id' => $n->id,
                    'type' => $n->type,
                    'title' => \is_string($title) ? $title : '',
                    'body' => \is_string($body) ? $body : '',
                    'link' => \is_string($link) ? $link : null,
                    // Surface the stable `kind` discriminator so the
                    // SPA can render category-specific icons / styling
                    // without parsing the title (M9 PR-F slice 1).
                    // Notifications without a `kind` (legacy rows
                    // from before this field landed) surface as null.
                    'kind' => \is_string($kind) ? $kind : null,
                    // Actor identity for the avatar (#1131). Community
                    // notifications carry `{name, avatar_url}`; system
                    // notifications (recap, payment, …) carry no actor.
                    'actor' => \is_array($actor) ? $actor : null,
                    'read_at' => $n->read_at?->toIso8601String(),
                    'created_at' => $n->created_at?->toIso8601String(),
                ];
            })->all(),
            'meta' => [
                'unread_count' => $unread,
            ],
        ]);
    }

    public function markAsRead(Request $request, string $id): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        /** @var DatabaseNotification|null $row */
        $row = $user->notifications()->find($id);
        if ($row === null) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        if ($row->read_at === null) {
            $row->markAsRead();
        }

        return response()->json([
            'data' => [
                'id' => $row->id,
                'read_at' => $row->read_at?->toIso8601String(),
            ],
        ]);
    }

    public function markAllAsRead(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        // Single bulk UPDATE — atomic, no N+1 load-then-flip. The
        // affected-row count IS the marked_read total, so we don't
        // need a separate count() query upfront. Scales O(1) wire
        // roundtrips regardless of inbox size.
        $now = now();
        $flipped = $user->unreadNotifications()->update([
            'read_at' => $now,
            'updated_at' => $now,
        ]);

        return response()->json([
            'data' => [
                'marked_read' => $flipped,
            ],
        ]);
    }
}
