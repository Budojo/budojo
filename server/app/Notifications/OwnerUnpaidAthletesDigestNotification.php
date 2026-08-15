<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\Academy;
use App\Models\Athlete;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Collection;

/**
 * Owner-side monthly digest of athletes who have not paid, as an in-app
 * notification (#1225, M11 #1218).
 *
 * Same shape as OwnerMedicalCertExpiringDigestNotification: the hosted app
 * keeps its queued UnpaidAthletesDigestMail untouched, the desktop gets this
 * `notifications` row that the bell shows and the Electron shell toasts.
 * DeliverOwnerDigestAction picks one by Capability::Email.
 */
class OwnerUnpaidAthletesDigestNotification extends Notification
{
    use Queueable;

    /**
     * @param  Collection<int, Athlete>  $athletes  unpaid, active athletes for ($year, $month)
     */
    public function __construct(
        private readonly Academy $academy,
        private readonly Collection $athletes,
        private readonly int $year,
        private readonly int $month,
    ) {
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
        $count = $this->athletes->count();

        return [
            'title' => $count === 1
                ? '1 athlete has not paid this month'
                : \sprintf('%d athletes have not paid this month', $count),
            'body' => $this->athletes
                ->map(static fn (Athlete $athlete): string => trim($athlete->first_name . ' ' . $athlete->last_name))
                ->take(3)
                ->implode(', ') . ($count > 3 ? \sprintf(' and %d more', $count - 3) : ''),
            'link' => '/dashboard/athletes?paid=0',
            'kind' => 'unpaid_athletes_digest',
            'academy_id' => $this->academy->id,
            'year' => $this->year,
            'month' => $this->month,
        ];
    }
}
