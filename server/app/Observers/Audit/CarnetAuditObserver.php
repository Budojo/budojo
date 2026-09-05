<?php

declare(strict_types=1);

namespace App\Observers\Audit;

use App\Actions\Audit\WriteAuditEntry;
use App\Models\Carnet;
use App\Support\Audit\PiiRedactor;
use App\Support\Audit\ResolvesAuditActor;

// Bulk callers must pre-load `athlete.academy` to avoid N×2 queries per event.
class CarnetAuditObserver
{
    use ResolvesAuditActor;

    public function __construct(
        private readonly WriteAuditEntry $writeAuditEntry,
        private readonly PiiRedactor $redactor,
    ) {
    }

    /**
     * Only `created` is wired: a sold carnet is a fact, and the API exposes
     * no edit or delete for it. Add the sibling hooks the day one appears.
     */
    public function created(Carnet $carnet): void
    {
        $this->writeAuditEntry->execute(
            action: 'carnet.created',
            actor: $this->currentActor(),
            academy: $carnet->athlete?->academy,
            subjectType: Carnet::class,
            subjectId: $carnet->id,
            subjectLabel: $this->labelFor($carnet),
            after: $this->redactor->redact($carnet->getAttributes()),
            ip: request()->ip(),
            userAgent: request()->userAgent(),
        );
    }

    private function labelFor(Carnet $carnet): string
    {
        // Format: "Mario Rossi — A7K2" so the activity row reads at a glance.
        $athleteName = $carnet->athlete !== null
            ? trim($carnet->athlete->first_name . ' ' . $carnet->athlete->last_name)
            : 'Athlete #' . $carnet->athlete_id;

        return $athleteName . ' — ' . $carnet->code;
    }
}
