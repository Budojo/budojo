<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Enums\RsvpResponse;
use App\Models\CommunityPost;
use App\Models\User;
use App\Notifications\Channels\WebPushChannel;
use App\Support\CommunityLink;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Owner-side push when someone RSVPs to an event the owner posted
 * (#729 C2). Recipient = the event post author. The RSVP-ing user
 * is excluded by the trigger site.
 */
class OwnerEventRsvpNotification extends Notification
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
        \assert($notifiable instanceof User);

        return [
            'title' => $this->title(),
            'body' => $this->body(),
            'link' => CommunityLink::forPost($notifiable, $this->post->id),
            'kind' => 'owner_event_rsvp',
            'post_id' => $this->post->id,
            'response' => $this->response->value,
        ];
    }

    private function title(): string
    {
        return \sprintf(
            '%s RSVP\'d to your event',
            trim($this->responder->first_name . ' ' . $this->responder->last_name),
        );
    }

    private function body(): string
    {
        return match ($this->response) {
            RsvpResponse::Going => 'Marked themselves as going.',
            RsvpResponse::Maybe => 'Said maybe.',
        };
    }
}
