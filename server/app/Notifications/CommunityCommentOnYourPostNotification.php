<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\PostComment;
use App\Models\User;
use App\Notifications\Channels\WebPushChannel;
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
class CommunityCommentOnYourPostNotification extends Notification
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
        return $this->payload();
    }

    /**
     * @return array<string, mixed>
     */
    public function toWebPush(object $notifiable): array
    {
        return $this->payload();
    }

    /**
     * @return array<string, mixed>
     */
    private function payload(): array
    {
        return [
            'title' => $this->title(),
            'body' => $this->body(),
            'link' => $this->link(),
            'kind' => 'community_comment_on_your_post',
            'post_id' => $this->newComment->post_id,
            'comment_id' => $this->newComment->id,
        ];
    }

    private function title(): string
    {
        return \sprintf(
            '%s commented on your post',
            trim($this->commenter->first_name . ' ' . $this->commenter->last_name),
        );
    }

    private function body(): string
    {
        return mb_strimwidth($this->newComment->body, 0, 100, '…');
    }

    private function link(): string
    {
        return \sprintf('/dashboard/me/feed#post-%d', $this->newComment->post_id);
    }
}
