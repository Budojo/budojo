<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\Athlete;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Athlete-side push to the athlete who was just promoted to a new
 * belt (#729 B2). Distinct from `CommunityBeltCelebrationNotification`
 * which informs OTHER members of the academy about the promotion —
 * this is the personal acknowledgement to the person being promoted.
 *
 * Fires from `AthleteObserver::handleBeltChange`. Skipped when the
 * athlete has no linked `user_id` (invitation-pending row).
 */
class AthletePromotedNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly Athlete $athlete,
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
        return [
            'title' => 'Congratulations on your promotion!',
            'body' => \sprintf('You\'ve been promoted from %s to %s belt.', $this->oldBelt, $this->newBelt),
            'link' => '/dashboard/me/profile',
            'kind' => 'athlete_promoted',
            'athlete_id' => $this->athlete->id,
            'old_belt' => $this->oldBelt,
            'new_belt' => $this->newBelt,
        ];
    }
}
