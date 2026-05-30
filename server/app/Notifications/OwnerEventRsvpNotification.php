<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Enums\RsvpResponse;
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
 * Owner-side push when someone RSVPs to an event the owner posted
 * (#729 C2). Recipient = the event post author. The RSVP-ing user
 * is excluded by the trigger site.
 */
class OwnerEventRsvpNotification extends Notification implements AggregatesInInbox
{
    use Queueable;

    public function __construct(
        private readonly CommunityPost $post,
        private readonly User $responder,
        private readonly RsvpResponse $response,
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
        return [...$this->payload($notifiable), 'aggregate_actor_ids' => [$this->responder->id]];
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
        return $this->responder;
    }

    public function inboxAggregatedTitle(string $recentActorName, int $otherCount): string
    {
        return AggregatedTitle::make($recentActorName, $otherCount, 'RSVP\'d to your event');
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
        \assert($notifiable instanceof User);

        return [
            'title' => $this->title(),
            'body' => $this->body(),
            'link' => CommunityLink::forPost($notifiable, $this->post->id),
            'kind' => 'owner_event_rsvp',
            'actor' => NotificationActor::fromUser($this->responder),
            'post_id' => $this->post->id,
            'response' => $this->response->value,
        ];
    }

    private function title(): string
    {
        return $this->inboxAggregatedTitle($this->responder->full_name, 0);
    }

    private function body(): string
    {
        return match ($this->response) {
            RsvpResponse::Going => 'Marked themselves as going.',
            RsvpResponse::Maybe => 'Said maybe.',
        };
    }
}
