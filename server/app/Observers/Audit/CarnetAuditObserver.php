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

    /**
     * Re-dating moves money: it changes which sessions the athlete has already
     * paid for, so the before/after of `valid_from` and `expires_at` belongs in
     * the log as much as the sale does (#1380).
     */
    public function updated(Carnet $carnet): void
    {
        $changes = $carnet->getChanges();
        if ($changes === []) {
            return;
        }
        $before = array_intersect_key($carnet->getOriginal(), $changes);

        $this->writeAuditEntry->execute(
            action: 'carnet.updated',
            actor: $this->currentActor(),
            academy: $carnet->athlete?->academy,
            subjectType: Carnet::class,
            subjectId: $carnet->id,
            subjectLabel: $this->labelFor($carnet),
            before: $this->redactor->redact($before),
            after: $this->redactor->redact($changes),
            ip: request()->ip(),
            userAgent: request()->userAgent(),
        );
    }

    /**
     * `deleting`, not `deleted`: the row still has to be readable to record
     * what was removed. Same shape as the payment observer.
     */
    public function deleting(Carnet $carnet): void
    {
        $this->writeAuditEntry->execute(
            action: 'carnet.deleted',
            actor: $this->currentActor(),
            academy: $carnet->athlete?->academy,
            subjectType: Carnet::class,
            subjectId: $carnet->id,
            subjectLabel: $this->labelFor($carnet),
            before: $this->redactor->redact($carnet->getAttributes()),
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
