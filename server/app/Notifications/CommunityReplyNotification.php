<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\PostComment;
use App\Models\User;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Inbox notification fired to every sibling commenter under a
 * community post when a new comment lands (M9 PR-F slice 1, #606).
 * The author of the new comment never gets notified about their own
 * post — the trigger callsite is responsible for excluding them
 * from the recipient set.
 *
 * Channel: `database` only in V1 — the inbox bell-dropdown surfaces
 * the row immediately. A future PR can add a `webpush` channel
 * gated on `users.push_subscriptions` rows; the data shape stays
 * the same.
 *
 * Opt-out: gated server-side at the trigger site via
 * `NotificationPreferences::isEnabled($user,
 * NotificationCategory::COMMUNITY_REPLY)` — this class is fired
 * only for recipients who have NOT opted out.
 */
class CommunityReplyNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly PostComment $newComment,
        private readonly User $author,
    ) {
    }

    /**
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['database'];
    }

    /**
     * @return array<string, mixed>
     */
    public function toDatabase(object $notifiable): array
    {
        return [
            'title' => \sprintf(
                '%s commented on a post you replied to',
                trim($this->author->first_name . ' ' . $this->author->last_name),
            ),
            // Excerpt of the new comment — 100 chars is enough for
            // the dropdown row preview and matches the inbox's
            // visual budget without truncating mid-word badly.
            'body' => mb_strimwidth($this->newComment->body, 0, 100, '…'),
            'link' => \sprintf('/dashboard/me/feed#post-%d', $this->newComment->post_id),
            // Stable kind key so the SPA can render a community-
            // specific icon / styling without parsing the title.
            'kind' => 'community_reply',
            'post_id' => $this->newComment->post_id,
            'comment_id' => $this->newComment->id,
        ];
    }
}
