<?php

declare(strict_types=1);

namespace App\Observers\Audit;

use App\Actions\Audit\WriteAuditEntry;
use App\Models\Athlete;
use App\Models\User;
use App\Support\Audit\PiiRedactor;
use Illuminate\Support\Facades\Auth;

// Audit hooks for the Athlete model (#429). Separate from AthleteObserver
// so the SRP holds: AthleteObserver does community/notification side
// effects on belt changes; this one writes audit rows. Both register on
// Athlete::observe() in AppServiceProvider::boot().
class AthleteAuditObserver
{
    public function __construct(
        private readonly WriteAuditEntry $writeAuditEntry,
        private readonly PiiRedactor $redactor,
    ) {
    }

    public function created(Athlete $athlete): void
    {
        $this->writeAuditEntry->execute(
            action: 'athlete.created',
            actor: $this->currentActor(),
            academy: $athlete->academy,
            subjectType: Athlete::class,
            subjectId: $athlete->id,
            subjectLabel: $this->labelFor($athlete),
            after: $this->redactor->redact($athlete->getAttributes()),
            ip: request()->ip(),
            userAgent: request()->userAgent(),
        );
    }

    public function updated(Athlete $athlete): void
    {
        // Skip if nothing changed in the persisted fields — Eloquent fires
        // `updated` even on `->save()` no-ops sometimes (touching timestamps
        // counts). We only care when a tracked attribute drifted.
        $changes = $athlete->getChanges();
        if ($changes === []) {
            return;
        }

        $before = array_intersect_key($athlete->getOriginal(), $changes);
        $after = $changes;

        // Belt change deserves its own action verb for filterability —
        // the activity page lets owners filter "athlete.belt.promoted"
        // separately from "athlete.updated" (generic field edit).
        $action = isset($changes['belt']) ? 'athlete.belt.promoted' : 'athlete.updated';

        $this->writeAuditEntry->execute(
            action: $action,
            actor: $this->currentActor(),
            academy: $athlete->academy,
            subjectType: Athlete::class,
            subjectId: $athlete->id,
            subjectLabel: $this->labelFor($athlete),
            before: $this->redactor->redact($before),
            after: $this->redactor->redact($after),
            ip: request()->ip(),
            userAgent: request()->userAgent(),
        );
    }

    public function deleting(Athlete $athlete): void
    {
        // Fires BEFORE the soft-delete commits. Captures the row's
        // pre-deletion state so the trail shows what was lost.
        $this->writeAuditEntry->execute(
            action: 'athlete.deleted',
            actor: $this->currentActor(),
            academy: $athlete->academy,
            subjectType: Athlete::class,
            subjectId: $athlete->id,
            subjectLabel: $this->labelFor($athlete),
            before: $this->redactor->redact($athlete->getAttributes()),
            ip: request()->ip(),
            userAgent: request()->userAgent(),
        );
    }

    private function labelFor(Athlete $athlete): string
    {
        return trim($athlete->first_name . ' ' . $athlete->last_name);
    }

    private function currentActor(): ?User
    {
        $user = Auth::user();

        return $user instanceof User ? $user : null;
    }
}
