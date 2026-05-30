<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\PostComment;
use App\Models\User;
use App\Notifications\Channels\WebPushChannel;
use App\Notifications\Contracts\AggregatesInInbox;
use App\Support\AggregatedTitle;
use App\Support\CommunityLink;
use App\Support\NotificationActor;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Pings the POST AUTHOR when someone else comments under their post
 * (#729 A6). Distinct from `CommunityReplyNotification` which pings
 * sibling commenters of a thread you participate in — this is the
 * "you authored, someone replied" leaf the matrix was missing.
 *
 * The commenter is never the recipient (no self-ping); the trigger
 * site (`CreateCommentAction`) excludes them.
 */
class CommunityCommentOnYourPostNotification extends Notification implements AggregatesInInbox
{
    use Queueable;

    public function __construct(
        private readonly PostComment $newComment,
        private readonly User $commenter,
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
        // `aggregate_actor_ids` is inbox-only bookkeeping for the write-time
        // aggregation (#1139); the push fires once and carries no aggregate
        // state, so it stays out of toWebPush().
        return [...$this->payload($notifiable), 'aggregate_actor_ids' => [$this->commenter->id]];
    }

    /**
     * @return array<string, mixed>
     */
    public function toWebPush(object $notifiable): array
    {
        return $this->payload($notifiable);
    }

    public function inboxPostId(): int
    {
        return $this->newComment->post_id;
    }

    public function inboxActor(): User
    {
        return $this->commenter;
    }

    public function inboxAggregatedTitle(string $recentActorName, int $otherCount): string
    {
        return AggregatedTitle::make($recentActorName, $otherCount, 'commented on your post');
    }

    public function inboxBody(): string
    {
        return $this->body();
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(object $notifiable): array
    {
        return [
            'title' => $this->title(),
            'body' => $this->body(),
            'link' => $this->link($notifiable),
            'kind' => 'community_comment_on_your_post',
            'actor' => NotificationActor::fromUser($this->commenter),
            'post_id' => $this->newComment->post_id,
            'comment_id' => $this->newComment->id,
        ];
    }

    private function title(): string
    {
        return $this->inboxAggregatedTitle($this->commenter->full_name, 0);
    }

    private function body(): string
    {
        return mb_strimwidth($this->newComment->body, 0, 100, '…');
    }

    private function link(object $notifiable): string
    {
        \assert($notifiable instanceof User);

        return CommunityLink::forPost($notifiable, $this->newComment->post_id);
    }
}
