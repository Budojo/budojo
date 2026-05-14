<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\AthletePayment;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Athlete-side acknowledgement push when the owner marks the
 * monthly payment as paid (#729 B3). Confirmation receipt — the
 * athlete sees the same thing on their profile, but a proactive push
 * closes the loop visibly.
 */
class AthletePaymentMarkedPaidNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly AthletePayment $payment,
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
        $monthLabel = \sprintf('%04d-%02d', $this->payment->year, $this->payment->month);

        return [
            'title' => 'Payment received',
            'body' => \sprintf('Your %s monthly fee is marked as paid.', $monthLabel),
            'link' => '/dashboard/me/payments',
            'kind' => 'athlete_payment_marked_paid',
            'payment_id' => $this->payment->id,
            'year' => $this->payment->year,
            'month' => $this->payment->month,
        ];
    }
}
