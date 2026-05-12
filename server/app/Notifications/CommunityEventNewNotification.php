<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\CommunityPost;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Inbox notification fired when the academy owner posts a new event
 * to the community feed (M9 PR-F slice 2, #606). Recipients are
 * athletes in the academy with a linked `user_id` (invite-pending
 * rows skipped); the trigger callsite (CreateEventAction) excludes
 * the editor and gates recipients on the `community_event_new`
 * opt-in.
 *
 * Channel: `database` only in V1, surfaces via the bell-dropdown
 * (#418). Default-**on** — events are deliberate and relatively rare,
 * and joining the academy is the implicit opt-in.
 *
 * Carries the event title + start time + post id on the wire so the
 * inbox row reads "New event: Open mat — Saturday" without the SPA
 * having to round-trip the community post for a list-row render.
 * When the payload's title is missing or blank, the wire title falls
 * back to a bare "New event" (no `New event: New event` double-
 * prefix — Copilot review on #634).
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
        $rawTitle = \is_string($payload['title'] ?? null) ? trim($payload['title']) : '';
        $startsAt = \is_string($payload['starts_at'] ?? null) ? $payload['starts_at'] : null;
        $location = \is_string($payload['location_text'] ?? null) ? $payload['location_text'] : null;

        // When the payload's title is missing or blank, fall back to a
        // bare "New event" — never the "New event: New event" double-
        // prefix the naive sprintf produced (Copilot review on #634).
        // 100-char cap matches the inbox row visual budget.
        $title = $rawTitle !== ''
            ? \sprintf('New event: %s', mb_strimwidth($rawTitle, 0, 100, '…'))
            : 'New event';

        return [
            'title' => $title,
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
