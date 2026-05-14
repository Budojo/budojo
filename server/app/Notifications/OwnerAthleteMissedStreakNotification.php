<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\Athlete;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Owner-side push when an active athlete has missed `$consecutive`
 * scheduled trainings in a row (#729 C3). Engagement alert —
 * surfaces a churn signal so the owner can reach out before the
 * athlete drops off.
 */
class OwnerAthleteMissedStreakNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly Athlete $athlete,
        private readonly int $consecutive,
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
            'title' => \sprintf('%s hasn\'t trained in a while', $athleteName),
            'body' => \sprintf('Missed the last %d scheduled trainings.', $this->consecutive),
            'link' => \sprintf('/dashboard/athletes/%d', $this->athlete->id),
            'kind' => 'owner_athlete_missed_streak',
            'athlete_id' => $this->athlete->id,
            'consecutive' => $this->consecutive,
        ];
    }
}
