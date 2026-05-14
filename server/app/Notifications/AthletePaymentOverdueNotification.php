<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\Academy;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Athlete-side reminder when the monthly fee for the current month
 * is still unpaid past the per-academy grace day (#729 B4).
 * Counterpart to the owner-side `UnpaidAthletesDigestMail` — that
 * digest tells the owner about ALL unpaid athletes; this notifies
 * the individual athlete directly.
 *
 * Fires once on the 6th of the month (i.e. after the standard
 * month-start payment window) via
 * `budojo:send-athlete-payment-overdue-pushes`.
 */
class AthletePaymentOverdueNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly Academy $academy,
        private readonly int $year,
        private readonly int $month,
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
        $monthLabel = \sprintf('%04d-%02d', $this->year, $this->month);

        return [
            'title' => 'Monthly fee still unpaid',
            'body' => \sprintf('Your %s fee for %s is still outstanding.', $this->academy->name, $monthLabel),
            'link' => '/dashboard/me/payments',
            'kind' => 'athlete_payment_overdue',
            'academy_id' => $this->academy->id,
            'year' => $this->year,
            'month' => $this->month,
        ];
    }
}
