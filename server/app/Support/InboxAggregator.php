<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\User;
use App\Notifications\Contracts\AggregatesInInbox;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Facades\DB;

/**
 * Write-time aggregation of community interaction notifications (#1139,
 * epic #1128). A burst of reactions / comments / RSVPs on one post folds
 * into a single UNREAD inbox row — "X and N others …", naming the most
 * recent actor, bubbled to the top — instead of stacking a fresh row +
 * push per event.
 *
 * Behaviour (confirmed in the spike):
 *  - **Fold while unread.** Once the recipient reads the row, the next
 *    event starts a new notification (the read row is left untouched).
 *  - **Push once, then silent.** Only the first event of a group runs the
 *    normal `notify()` path (DB row + web push); folds touch the DB only.
 *  - **Most recent actor named**, distinct actors counted (an actor acting
 *    twice — e.g. an emoji swap — does not inflate the count).
 *
 * The fold read-then-write is wrapped in a transaction with a row lock so
 * concurrent events serialize onto one row. Two simultaneous FIRST events
 * (no row to lock yet) can still race into two rows — a rare, cosmetic
 * edge that self-heals as later events fold onto the most recent; the
 * existing best-effort notification posture already tolerates it.
 */
final class InboxAggregator
{
    public function record(User $recipient, AggregatesInInbox&Notification $notification): void
    {
        $folded = DB::transaction(function () use ($recipient, $notification): bool {
            /** @var DatabaseNotification|null $existing */
            $existing = $recipient->unreadNotifications()
                ->where('type', $notification::class)
                ->where('data->post_id', $notification->inboxPostId())
                ->orderByDesc('created_at')
                ->lockForUpdate()
                ->first();

            if ($existing === null) {
                return false;
            }

            $this->fold($existing, $notification);

            return true;
        });

        if (! $folded) {
            // First event for this (recipient, type, post): the normal
            // path writes the DB row AND fires the web push.
            $recipient->notify($notification);
        }
    }

    private function fold(DatabaseNotification $existing, AggregatesInInbox $notification): void
    {
        $actor = $notification->inboxActor();

        /** @var array<string, mixed> $data */
        $data = $existing->data;

        $ids = [];
        if (isset($data['aggregate_actor_ids']) && \is_array($data['aggregate_actor_ids'])) {
            // Stored as JSON ints on the create path; filter (not cast) keeps
            // PHPStan's strict cast rule happy and drops any exotic value.
            $ids = array_values(array_unique(array_filter($data['aggregate_actor_ids'], 'is_int')));
        }
        if (! \in_array($actor->id, $ids, true)) {
            $ids[] = $actor->id;
        }

        $otherCount = max(0, \count($ids) - 1);

        $data['actor'] = NotificationActor::fromUser($actor);
        $data['aggregate_actor_ids'] = $ids;
        $data['title'] = $notification->inboxAggregatedTitle($actor->full_name, $otherCount);
        $data['body'] = $notification->inboxBody();

        $now = now();
        $existing->forceFill([
            'data' => $data,
            // The aggregate's activity time is the latest event: bubble the
            // row to the top of the inbox (ordered by created_at) and let
            // its relative time read "just now".
            'created_at' => $now,
            'updated_at' => $now,
        ])->save();
    }
}
