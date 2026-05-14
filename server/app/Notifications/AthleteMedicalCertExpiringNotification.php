<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\Document;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Athlete-side push when their own medical cert hits the T-30 / T-7 /
 * T-0 thresholds (#729 B1). Counterpart to the owner-side
 * `MedicalCertificateExpiringMail` digest — same triggers, but the
 * athlete personally receives a direct ping instead of the digest
 * email landing in the owner's inbox.
 *
 * The `daysToExpiry` parameter feeds the title copy so the SPA push
 * handler doesn't need to recompute it from the timestamp.
 */
class AthleteMedicalCertExpiringNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly Document $document,
        private readonly int $daysToExpiry,
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
            'link' => '/dashboard/me/documents',
            'kind' => 'athlete_medical_cert_expiring',
            'document_id' => $this->document->id,
            'days_to_expiry' => $this->daysToExpiry,
        ];
    }

    private function title(): string
    {
        return match (true) {
            $this->daysToExpiry <= 0 => 'Your medical certificate expires today',
            $this->daysToExpiry === 1 => 'Your medical certificate expires tomorrow',
            default => \sprintf('Your medical certificate expires in %d days', $this->daysToExpiry),
        };
    }

    private function body(): string
    {
        return 'Renew it and upload the new copy to keep training.';
    }
}
