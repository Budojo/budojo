<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\PostComment;
use App\Models\User;
use App\Notifications\Channels\WebPushChannel;
use App\Support\CommunityLink;
use App\Support\NotificationActor;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Inbox notification fired to every sibling commenter under a
 * community post when a new comment lands (M9 PR-F slice 1, #606).
 * The author of the new comment never gets notified about their own
 * post — the trigger callsite is responsible for excluding them
 * from the recipient set.
 *
 * Channels:
 *   - `database` — always on. Backs the inbox bell-dropdown.
 *   - `WebPushChannel` (#696) — fans out to every `push_subscriptions`
 *     row the user has opted in from (`/dashboard/profile` → Browser
 *     notifications). The channel is a no-op when the user has zero
 *     subscriptions, so adding it unconditionally is safe.
 *
 * Opt-out: gated server-side at the trigger site via
 * `NotificationPreferences::isEnabled($user,
 * NotificationCategory::COMMUNITY_REPLY)` — this class is fired
 * only for recipients who have NOT opted out. The single gate
 * covers both channels.
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
        return ['database', WebPushChannel::class];
    }

    /**
     * @return array<string, mixed>
     */
    public function toDatabase(object $notifiable): array
    {
        return [
            'title' => $this->title(),
            'body' => $this->body(),
            'link' => $this->link($notifiable),
            'kind' => 'community_reply',
            'actor' => NotificationActor::fromUser($this->author),
            'post_id' => $this->newComment->post_id,
            'comment_id' => $this->newComment->id,
        ];
    }

    /**
     * Browser Web Push payload (#696). Reuses the same title / body
     * / link the inbox row carries so the in-app inbox and the
     * out-of-tab toast stay visually consistent. `kind` lets the SPA
     * push handler render a community-specific icon without parsing
     * the title.
     *
     * @return array<string, mixed>
     */
    public function toWebPush(object $notifiable): array
    {
        return [
            'title' => $this->title(),
            'body' => $this->body(),
            'link' => $this->link($notifiable),
            'kind' => 'community_reply',
            'actor' => NotificationActor::fromUser($this->author),
            'post_id' => $this->newComment->post_id,
            'comment_id' => $this->newComment->id,
        ];
    }

    private function title(): string
    {
        return \sprintf(
            '%s commented on a post you replied to',
            trim($this->author->first_name . ' ' . $this->author->last_name),
        );
    }

    private function body(): string
    {
        // Excerpt of the new comment — 100 chars is enough for the
        // dropdown row preview and matches the inbox's visual budget
        // without truncating mid-word badly.
        return mb_strimwidth($this->newComment->body, 0, 100, '…');
    }

    private function link(object $notifiable): string
    {
        \assert($notifiable instanceof User);

        return CommunityLink::forPost($notifiable, $this->newComment->post_id);
    }
}
