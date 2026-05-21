<?php

declare(strict_types=1);

namespace App\Observers\Audit;

use App\Actions\Audit\WriteAuditEntry;
use App\Models\Document;
use App\Support\Audit\PiiRedactor;
use App\Support\Audit\ResolvesAuditActor;

class DocumentAuditObserver
{
    use ResolvesAuditActor;

    public function __construct(
        private readonly WriteAuditEntry $writeAuditEntry,
        private readonly PiiRedactor $redactor,
    ) {
    }

    public function created(Document $document): void
    {
        $this->writeAuditEntry->execute(
            action: 'document.uploaded',
            actor: $this->currentActor(),
            academy: $document->athlete?->academy,
            subjectType: Document::class,
            subjectId: $document->id,
            subjectLabel: $this->labelFor($document),
            after: $this->redactor->redact($document->getAttributes()),
            ip: request()->ip(),
            userAgent: request()->userAgent(),
        );
    }

    public function deleting(Document $document): void
    {
        $this->writeAuditEntry->execute(
            action: 'document.deleted',
            actor: $this->currentActor(),
            academy: $document->athlete?->academy,
            subjectType: Document::class,
            subjectId: $document->id,
            subjectLabel: $this->labelFor($document),
            before: $this->redactor->redact($document->getAttributes()),
            ip: request()->ip(),
            userAgent: request()->userAgent(),
        );
    }

    private function labelFor(Document $document): string
    {
        // Format: "<original_name> (<athlete-name>)" so the activity
        // row reads the file + who it belongs to at a glance.
        $athleteName = $document->athlete !== null
            ? trim($document->athlete->first_name . ' ' . $document->athlete->last_name)
            : 'Athlete #' . $document->athlete_id;

        return $document->original_name . ' (' . $athleteName . ')';
    }
}
