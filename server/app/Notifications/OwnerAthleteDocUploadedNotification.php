<?php

declare(strict_types=1);

namespace App\Notifications;

use App\Models\Document;
use App\Notifications\Channels\WebPushChannel;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

/**
 * Owner-side push when an athlete uploads a new document (#729 C1).
 * Fires from the document upload pipeline; the uploader (typically
 * the athlete) is excluded by the trigger site.
 */
class OwnerAthleteDocUploadedNotification extends Notification
{
    use Queueable;

    public function __construct(
        private readonly Document $document,
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
        $athlete = $this->document->athlete;
        $athleteName = $athlete === null
            ? 'An athlete'
            : trim($athlete->first_name . ' ' . $athlete->last_name);

        return [
            'title' => \sprintf('%s uploaded a new document', $athleteName),
            // Map the enum backing string to a user-readable label.
            // The raw value (`medical_certificate`) looks like a debug
            // dump in a push body; the spelled-out form reads as
            // human copy. Copilot review on #735.
            'body' => \sprintf('Type: %s.', self::humanType($this->document->type)),
            'link' => $athlete === null
                ? '/dashboard/athletes'
                : \sprintf('/dashboard/athletes/%d', $athlete->id),
            'kind' => 'owner_athlete_doc_uploaded',
            'document_id' => $this->document->id,
            'athlete_id' => $athlete?->id,
            'doc_type' => $this->document->type->value,
        ];
    }

    private static function humanType(\App\Enums\DocumentType $type): string
    {
        return match ($type) {
            \App\Enums\DocumentType::MedicalCertificate => 'Medical certificate',
            \App\Enums\DocumentType::IdCard => 'ID card',
            \App\Enums\DocumentType::Insurance => 'Insurance',
            \App\Enums\DocumentType::Other => 'Other',
        };
    }
}
