<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\Athlete;
use App\Models\CommunityPost;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Inbox notification fired when ANY athlete in the recipient's
 * academy is promoted to a new belt (M9 PR-F slice 3, #606). Every
 * non-editor academy user receives one — the trigger callsite is
 * responsible for excluding the editor.
 *
 * Channels:
 *   - `database` — always on; surfaces via the bell-dropdown (#418).
 *   - `WebPushChannel` (#702) — browser push for every device the
 *     user opted in from. No-op when the user has zero subscriptions.
 *
 * Default-off — recipients must explicitly opt in on the
 * `community_belt_celebration` toggle before the fanout reaches either
 * channel. The single gate covers both.
 *
 * Carries the athlete name on the wire so the inbox row reads
 * "Mario Rossi just earned the blue belt!" without the SPA having
 * to round-trip the athlete row again.
 */
class CommunityBeltCelebrationNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly Athlete $athlete,
        private readonly CommunityPost $post,
        private readonly string $oldBelt,
        private readonly string $newBelt,
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
        $athleteName = trim($this->athlete->first_name . ' ' . $this->athlete->last_name);

        return [
            'title' => \sprintf('%s just earned a new belt!', $athleteName !== '' ? $athleteName : 'A teammate'),
            'body' => \sprintf('%s → %s', $this->oldBelt, $this->newBelt),
            'link' => \sprintf('/dashboard/me/feed#post-%d', $this->post->id),
            'kind' => 'community_belt_celebration',
            'post_id' => $this->post->id,
            'athlete_id' => $this->athlete->id,
            'old_belt' => $this->oldBelt,
            'new_belt' => $this->newBelt,
        ];
    }
}
