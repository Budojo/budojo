<?php

declare(strict_types=1);

namespace App\Observers\Audit;

use App\Actions\Audit\WriteAuditEntry;
use App\Models\AthletePayment;
use App\Support\Audit\PiiRedactor;
use App\Support\Audit\ResolvesAuditActor;

class AthletePaymentAuditObserver
{
    use ResolvesAuditActor;

    public function __construct(
        private readonly WriteAuditEntry $writeAuditEntry,
        private readonly PiiRedactor $redactor,
    ) {
    }

    public function created(AthletePayment $payment): void
    {
        $this->writeAuditEntry->execute(
            action: 'payment.created',
            actor: $this->currentActor(),
            academy: $payment->athlete?->academy,
            subjectType: AthletePayment::class,
            subjectId: $payment->id,
            subjectLabel: $this->labelFor($payment),
            after: $this->redactor->redact($payment->getAttributes()),
            ip: request()->ip(),
            userAgent: request()->userAgent(),
        );
    }

    public function updated(AthletePayment $payment): void
    {
        $changes = $payment->getChanges();
        if ($changes === []) {
            return;
        }
        $before = array_intersect_key($payment->getOriginal(), $changes);

        $this->writeAuditEntry->execute(
            action: 'payment.updated',
            actor: $this->currentActor(),
            academy: $payment->athlete?->academy,
            subjectType: AthletePayment::class,
            subjectId: $payment->id,
            subjectLabel: $this->labelFor($payment),
            before: $this->redactor->redact($before),
            after: $this->redactor->redact($changes),
            ip: request()->ip(),
            userAgent: request()->userAgent(),
        );
    }

    public function deleting(AthletePayment $payment): void
    {
        $this->writeAuditEntry->execute(
            action: 'payment.deleted',
            actor: $this->currentActor(),
            academy: $payment->athlete?->academy,
            subjectType: AthletePayment::class,
            subjectId: $payment->id,
            subjectLabel: $this->labelFor($payment),
            before: $this->redactor->redact($payment->getAttributes()),
            ip: request()->ip(),
            userAgent: request()->userAgent(),
        );
    }

    private function labelFor(AthletePayment $payment): string
    {
        // Format: "Mario Rossi — 2026-05" so the activity row reads at a glance.
        $athleteName = $payment->athlete !== null
            ? trim($payment->athlete->first_name . ' ' . $payment->athlete->last_name)
            : 'Athlete #' . $payment->athlete_id;
        $period = \sprintf('%04d-%02d', $payment->year, $payment->month);

        return $athleteName . ' — ' . $period;
    }
}
