<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\Athlete;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Owner-side inbox + push notification fired the moment an athlete
 * the owner had on their roster completes signup — `AthleteInvitation`
 * accept OR the legacy manual-link path (#729 A1).
 *
 * Recipient: the academy owner (single user — `academies.user_id`).
 * The just-signed-up athlete is never notified — they're on the page
 * already.
 *
 * Channels:
 *   - `database` — inbox bell.
 *   - `WebPushChannel` — OS-level notification, gated by
 *     `NotificationCategory::ATHLETE_SIGNED_UP` server-side and the
 *     channel's own quiet-hours window (#729 A3).
 */
class AthleteSignedUpNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly Athlete $athlete,
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
            'title' => $this->title(),
            'body' => $this->body(),
            'link' => $this->link(),
            'kind' => 'athlete_signed_up',
            'athlete_id' => $this->athlete->id,
        ];
    }

    private function title(): string
    {
        return \sprintf(
            '%s joined your academy',
            trim($this->athlete->first_name . ' ' . $this->athlete->last_name),
        );
    }

    private function body(): string
    {
        return 'They completed signup and can now sign in.';
    }

    private function link(): string
    {
        return \sprintf('/dashboard/athletes/%d', $this->athlete->id);
    }
}
