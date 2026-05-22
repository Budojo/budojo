<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\Academy;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Push reminder fired once per training-scheduled day at the local
 * 07:00 wake-up window. Sent ONLY when the athlete has not already
 * been marked present for the day, so a 6:30 open-mat athlete
 * doesn't get a redundant ping (#729 A2).
 *
 * Channels:
 *   - `database` — inbox bell.
 *   - `WebPushChannel` — OS-level notification (the primary surface
 *     for this category — the inbox row is the secondary catch-up
 *     for users whose phones were off at 07:00).
 *
 * Quiet hours: the channel applies them automatically; if the
 * athlete configured a quiet window covering 07:00 — uncommon, but
 * legitimate — push is suppressed and the inbox row still records.
 */
class AthleteTrainingTodayNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly Academy $academy,
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
            'title' => 'Today is training day',
            'body' => \sprintf('Tap to register your attendance at %s.', $this->academy->name),
            'link' => '/dashboard/me/attendance/today',
            'kind' => 'athlete_training_today',
            'academy_id' => $this->academy->id,
        ];
    }
}
