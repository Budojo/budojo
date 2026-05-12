<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\CommunityPost;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Inbox notification fired when the academy owner posts a new event
 * to the community feed (M9 PR-F slice 2, #606). Every non-editor
 * academy user receives one — the trigger callsite (CreateEventAction)
 * is responsible for excluding the editor and gating recipients on
 * the `community_event_new` opt-in.
 *
 * Channel: `database` only in V1, surfaces via the bell-dropdown
 * (#418). Default-**on** — events are deliberate and relatively rare,
 * and joining the academy is the implicit opt-in.
 *
 * Carries the event title + start time + post id on the wire so the
 * inbox row reads "New event: Open mat — Saturday" without the SPA
 * having to round-trip the community post for a list-row render.
 */
class CommunityEventNewNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly CommunityPost $post)
    {
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
        /** @var array<string, mixed> $payload */
        $payload = $this->post->payload ?? [];
        $title = \is_string($payload['title'] ?? null) ? $payload['title'] : 'New event';
        $startsAt = \is_string($payload['starts_at'] ?? null) ? $payload['starts_at'] : null;
        $location = \is_string($payload['location_text'] ?? null) ? $payload['location_text'] : null;

        return [
            // 100-char title cap matches the inbox row visual budget.
            'title' => \sprintf('New event: %s', mb_strimwidth($title, 0, 100, '…')),
            // The body is the human-readable when + where; SPA can
            // re-format the timestamp client-side but the raw ISO
            // value gives it the timezone it needs without parsing
            // back through the post.
            'body' => $location !== null ? $location : '',
            'link' => \sprintf('/dashboard/me/feed#post-%d', $this->post->id),
            'kind' => 'community_event_new',
            'post_id' => $this->post->id,
            'starts_at' => $startsAt,
        ];
    }
}
