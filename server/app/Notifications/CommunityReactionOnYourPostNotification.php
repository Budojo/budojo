<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Enums\ReactionEmoji;
use App\Models\CommunityPost;
use App\Models\User;
use App\Notifications\Channels\WebPushChannel;
use App\Notifications\Contracts\AggregatesInInbox;
use App\Support\AggregatedTitle;
use App\Support\CommunityLink;
use App\Support\NotificationActor;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Pings the POST AUTHOR when someone reacts (clap / pray) on their
 * post (#729 A7). The reactor is never the recipient (no self-ping);
 * the trigger site (`ToggleReactionAction`) excludes them.
 *
 * Future work — debounce / coalesce: if a popular post gets 5 claps
 * in a minute, today the author receives 5 separate pushes. A V2 can
 * batch via a queued job that flushes per-author / per-post after a
 * short debounce window. Out of scope for v1 of this notification.
 */
class CommunityReactionOnYourPostNotification extends Notification implements AggregatesInInbox
{
    use Queueable;

    public function __construct(
        private readonly CommunityPost $post,
        private readonly User $reactor,
        private readonly ReactionEmoji $emoji,
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
        return [...$this->payload($notifiable), 'aggregate_actor_ids' => [$this->reactor->id]];
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
        return $this->post->id;
    }

    public function inboxActor(): User
    {
        return $this->reactor;
    }

    public function inboxAggregatedTitle(string $recentActorName, int $otherCount): string
    {
        return AggregatedTitle::make($recentActorName, $otherCount, 'reacted to your post');
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
            'kind' => 'community_reaction_on_your_post',
            'actor' => NotificationActor::fromUser($this->reactor),
            'post_id' => $this->post->id,
            'emoji' => $this->emoji->value,
        ];
    }

    private function title(): string
    {
        return $this->inboxAggregatedTitle($this->reactor->full_name, 0);
    }

    private function body(): string
    {
        return match ($this->emoji) {
            ReactionEmoji::Clap => '👏 Clap',
            ReactionEmoji::Pray => '🙏 Pray',
        };
    }

    private function link(object $notifiable): string
    {
        \assert($notifiable instanceof User);

        return CommunityLink::forPost($notifiable, $this->post->id);
    }
}
