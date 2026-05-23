<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Actions\Engagement\WeeklyRecapResult;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Weekly recap push (#960). Fired Sunday 19:00 local by the
 * `budojo:send-weekly-recap-pushes` command — one per athlete per
 * academy with ≥1 session that week.
 *
 * Channels:
 *   - `database` — inbox row (catch-up for phones that were off Sun 19).
 *   - `WebPushChannel` — OS-level push, the primary surface.
 *
 * Tap-through deep-links to `/dashboard/me/recap/:isoWeekStart` where
 * the SPA renders the full numbers + the share-card button.
 */
class WeeklyRecapNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly WeeklyRecapResult $recap,
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
        $sessions = $this->recap->sessions;
        return [
            'title' => 'Your week on the mats',
            'body' => \sprintf(
                '%d session%s · %.1fh on the mat. Tap to see your week.',
                $sessions,
                $sessions === 1 ? '' : 's',
                $this->recap->hours,
            ),
            'link' => '/dashboard/me/recap/' . $this->recap->isoWeekStart,
            'kind' => 'weekly_recap',
            'iso_week_start' => $this->recap->isoWeekStart,
            'sessions' => $sessions,
            'hours' => $this->recap->hours,
        ];
    }
}
