<?php

declare(strict_types=1);

namespace App\Http\Controllers\User;

use App\Http\Controllers\Controller;
use App\Http\Requests\User\UnarchiveNotificationsRequest;
use App\Models\User;
use App\Support\NotificationText;
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

        // Two views of one inbox (#1914): what still needs the owner, and what
        // they archived. The bell counts only the first.
        $archived = $request->boolean('archived');

        /** @var \Illuminate\Database\Eloquent\Collection<int, DatabaseNotification> $rows */
        $rows = $user->notifications()
            ->when(
                $archived,
                static fn ($q) => $q->whereNotNull('archived_at')->reorder('archived_at', 'desc'),
                static fn ($q) => $q->whereNull('archived_at'),
            )
            ->limit(20)
            ->get();

        $unread = $user->unreadNotifications()->whereNull('archived_at')->count();
        // The owner's language, for the sentences written from `params`
        // (#1912). English until the SPA has said.
        $locale = $user->locale->value ?? 'en';

        return response()->json([
            'data' => $rows->map(static function (DatabaseNotification $n) use ($locale): array {
                // The Notification's toDatabase() return is in `data`.
                // Project a flat shape that mirrors what the SPA renders.
                /** @var array<string, mixed> $data */
                $data = $n->data;
                $text = NotificationText::of($data, $locale);
                $link = $data['link'] ?? null;
                $kind = $data['kind'] ?? null;
                $actor = $data['actor'] ?? null;

                return [
                    'id' => $n->id,
                    'type' => $n->type,
                    'title' => $text['title'],
                    'body' => $text['body'],
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
                    'archived_at' => self::archivedAt($n),
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

    /** Takes a notification out of "Da vedere", into "Archiviate" (#1914). */
    public function archive(Request $request, string $id): JsonResponse
    {
        return $this->setArchived($request, $id, now());
    }

    /** Brings an archived notification back (#1914). */
    public function unarchive(Request $request, string $id): JsonResponse
    {
        return $this->setArchived($request, $id, null);
    }

    /**
     * "Archivia le lette" (#1914): every read notification still in the inbox,
     * in one UPDATE. Unread ones stay — archiving what nobody has seen yet
     * would hide it before it was read.
     */
    public function archiveRead(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        // The ids first: "Annulla" has to bring back every row this took, not
        // only the twenty the page had loaded.
        /** @var list<string> $ids */
        $ids = $user->notifications()
            ->whereNotNull('read_at')
            ->whereNull('archived_at')
            ->pluck('id')
            ->all();
        $archived = $user->notifications()->whereIn('id', $ids)->update(['archived_at' => now()]);

        return response()->json(['data' => ['archived' => $archived, 'ids' => $ids]]);
    }

    /**
     * "Annulla" for a batch (#1914): the rows back into the inbox in one
     * request. Scoped to the user — an id that is not theirs is ignored.
     */
    public function unarchiveMany(UnarchiveNotificationsRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        /** @var list<string> $ids */
        $ids = $request->validated('ids');

        $unarchived = $user->notifications()->whereIn('id', $ids)->update(['archived_at' => null]);

        return response()->json(['data' => ['unarchived' => $unarchived]]);
    }

    /** 404 for anyone else's id, as `markAsRead` does: no probing by status. */
    private function setArchived(Request $request, string $id, ?\Illuminate\Support\Carbon $at): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        /** @var DatabaseNotification|null $row */
        $row = $user->notifications()->find($id);
        if ($row === null) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        $row->forceFill(['archived_at' => $at])->save();

        return response()->json(['data' => ['id' => $row->id, 'archived_at' => self::archivedAt($row)]]);
    }

    /**
     * `archived_at` is not a cast on Laravel's own model, so it comes back as
     * the stored string; it goes out in the same ISO shape as the others.
     */
    private static function archivedAt(DatabaseNotification $n): ?string
    {
        $at = $n->getAttribute('archived_at');

        return match (true) {
            $at instanceof \DateTimeInterface => \Illuminate\Support\Carbon::instance($at)->toIso8601String(),
            \is_string($at) => \Illuminate\Support\Carbon::parse($at)->toIso8601String(),
            default => null,
        };
    }
}
