<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\CommunityPost;
use App\Models\User;
use App\Notifications\Channels\WebPushChannel;
use App\Support\CommunityLink;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Pings every active member of the post's academy (athletes linked to
 * a user_id + every staff member) when a new community post lands
 * (#729 A5). Superset of `CommunityEventNewNotification` — covers
 * event, belt-promotion auto-post, and any future post type without a
 * matrix change. The author is never the recipient; trigger sites
 * exclude them.
 *
 * The "kind" payload key carries the post type so the SPA push handler
 * can render a type-specific icon without parsing the body. Inbox
 * rows surface the same kind for filtering.
 */
class CommunityNewPostNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly CommunityPost $post,
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
        return $this->payload($notifiable);
    }

    /**
     * @return array<string, mixed>
     */
    public function toWebPush(object $notifiable): array
    {
        return $this->payload($notifiable);
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
            'kind' => 'community_new_post',
            'post_id' => $this->post->id,
            'post_type' => $this->post->type->value,
        ];
    }

    private function title(): string
    {
        return match ($this->post->type->value) {
            'event' => 'New event in your academy',
            'belt_promotion' => 'A teammate was promoted',
            default => 'New post in your academy',
        };
    }

    private function body(): string
    {
        $payload = $this->post->payload ?? [];
        $title = isset($payload['title']) && \is_string($payload['title']) ? $payload['title'] : '';

        return $title !== '' ? mb_strimwidth($title, 0, 100, '…') : 'Open the feed to see what\'s new.';
    }

    private function link(object $notifiable): string
    {
        \assert($notifiable instanceof User);

        return CommunityLink::forPost($notifiable, $this->post->id);
    }
}
