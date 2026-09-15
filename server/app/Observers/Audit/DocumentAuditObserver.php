<?php

declare(strict_types=1);

namespace App\Observers\Audit;

use App\Actions\Audit\WriteAuditEntry;
use App\Models\Document;
use App\Support\Audit\PiiRedactor;
use App\Support\Audit\ResolvesAuditActor;

// Bulk callers must pre-load `athlete.academy` to avoid N×2 queries per event.
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
            academy: $this->academyOf($document),
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
            academy: $this->academyOf($document),
            subjectType: Document::class,
            subjectId: $document->id,
            subjectLabel: $this->labelFor($document),
            before: $this->redactor->redact($document->getAttributes()),
            ip: request()->ip(),
            userAgent: request()->userAgent(),
        );
    }

    /**
     * The academy the entry belongs to, for either kind of owner (#1743).
     *
     * `athlete?->academy` alone was null for every one of the academy's own
     * papers, and `ListAuditEntries` filters on `academy_id` — so uploading or
     * deleting the liability policy left no trace in the activity log at all,
     * which is the opposite of what an audit trail is for.
     */
    private function academyOf(Document $document): ?\App\Models\Academy
    {
        return $document->academy ?? $document->athlete?->academy;
    }

    private function labelFor(Document $document): string
    {
        // Format: "<original_name> (<owner>)" so the activity row reads the
        // file + whose it is at a glance. An academy paper has no person, so
        // it says so rather than rendering "Athlete #" with nothing after it.
        $athlete = $document->athlete;
        $academy = $document->academy;

        $owner = match (true) {
            $athlete !== null => trim($athlete->first_name . ' ' . $athlete->last_name),
            // Named, when the academy is still there to name. A row whose
            // academy has been deleted under it falls through to the generic
            // word rather than to "Athlete #", which it never was.
            $academy !== null => $academy->name,
            $document->academy_id !== null => 'Academy',
            default => 'Athlete #' . $document->athlete_id,
        };

        return $document->original_name . ' (' . $owner . ')';
    }
}
