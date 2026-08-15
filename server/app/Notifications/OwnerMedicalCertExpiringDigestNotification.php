<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\Academy;
use App\Models\Document;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Collection;

/**
 * Owner-side digest of medical certificates expiring soon, as an in-app
 * notification (#1225, M11 #1218).
 *
 * On the hosted profile this digest is the queued MedicalCertificateExpiringMail
 * it always was; on a runtime with no mail transport — the desktop — the same
 * digest is this row in the `notifications` table, which is what the bell shows
 * and what the Electron shell turns into a native toast. Which of the two goes
 * out is DeliverOwnerDigestAction's decision, keyed to Capability::Email; the
 * dedupe stays the command's notification_log claim in both cases.
 */
class OwnerMedicalCertExpiringDigestNotification extends Notification
{
    use Queueable;

    /**
     * @param  Collection<int, Document>  $documents  expiring rows for this academy on this run, `athlete` eager-loaded
     */
    public function __construct(
        private readonly Academy $academy,
        private readonly Collection $documents,
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
        $count = $this->documents->count();

        return [
            'title' => $count === 1
                ? 'A medical certificate is expiring'
                : \sprintf('%d medical certificates are expiring', $count),
            'body' => $this->body(),
            'link' => '/dashboard/documents/expiring',
            'kind' => 'medical_cert_expiry_reminders',
            'academy_id' => $this->academy->id,
            'document_ids' => $this->documents->pluck('id')->values()->all(),
        ];
    }

    private function body(): string
    {
        $names = $this->documents
            ->map(static fn (Document $document): string => trim(
                ($document->athlete->first_name ?? '') . ' ' . ($document->athlete->last_name ?? ''),
            ))
            ->filter()
            ->unique()
            ->values();

        $shown = $names->take(3)->implode(', ');
        $more = $names->count() - 3;

        return $more > 0 ? \sprintf('%s and %d more', $shown, $more) : $shown;
    }
}
