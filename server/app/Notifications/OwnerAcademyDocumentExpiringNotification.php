<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\Academy;
use App\Models\Document;
use Illuminate\Bus\Queueable;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Notifications\Notification;

/**
 * The academy's own papers are running out (#1743).
 *
 * A sibling of `OwnerMedicalCertExpiringDigestNotification`, not a widening of
 * it: that one names athletes in its body and titles itself "medical
 * certificates". This one names document types, because an academy's papers
 * have no person attached and "3 medical certificates are expiring" would be
 * a lie about a liability policy.
 *
 * `database` only. The medical digest also has a mail path on the hosted
 * profile; the desktop build has no mail transport, this is a desktop-first
 * product, and adding a second delivery channel for a surface nobody has
 * asked to receive by email is speculation.
 */
class OwnerAcademyDocumentExpiringNotification extends Notification
{
    use Queueable;

    /**
     * @param  Collection<int, Document>  $documents
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
                ? "One of the academy's documents is expiring"
                : \sprintf("%d of the academy's documents are expiring", $count),
            'body' => $this->body(),
            'link' => '/dashboard/documents/expiring',
            'kind' => 'academy_document_expiry_reminders',
            'academy_id' => $this->academy->id,
            'document_ids' => $this->documents->pluck('id')->values()->all(),
            // What `NotificationText` writes the sentence from, in the
            // owner's language (#1912). The date stays ISO here and is
            // written out in the reader's language.
            'params' => [
                'count' => $count,
                'documents' => $this->documents
                    ->map(static fn (Document $document): array => [
                        'name' => $document->original_name !== '' ? $document->original_name : $document->type->value,
                        'expires_on' => $document->expires_at?->toDateString(),
                    ])
                    ->values()
                    ->all(),
            ],
        ];
    }

    /**
     * The document's own name, which is the only handle the owner has on it —
     * there is no athlete to name. `original_name` is what they uploaded and
     * therefore what they will recognise; the type is the fallback for a file
     * called `scan001.pdf`.
     */
    private function body(): string
    {
        return $this->documents
            ->map(static fn (Document $document): string => \sprintf(
                '%s — %s',
                $document->original_name !== '' ? $document->original_name : $document->type->value,
                $document->expires_at?->toDateString() ?? '',
            ))
            ->implode("\n");
    }
}
