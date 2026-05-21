<?php

declare(strict_types=1);

namespace App\Observers\Audit;

use App\Actions\Audit\WriteAuditEntry;
use App\Models\Academy;
use App\Models\User;
use App\Support\Audit\PiiRedactor;
use Illuminate\Support\Facades\Auth;

class AcademyAuditObserver
{
    public function __construct(
        private readonly WriteAuditEntry $writeAuditEntry,
        private readonly PiiRedactor $redactor,
    ) {
    }

    public function updated(Academy $academy): void
    {
        $changes = $academy->getChanges();
        if ($changes === []) {
            return;
        }
        $before = array_intersect_key($academy->getOriginal(), $changes);

        // Logo replace gets its own verb for the activity-page filter.
        $action = isset($changes['logo_path']) ? 'academy.logo.replaced' : 'academy.updated';

        $this->writeAuditEntry->execute(
            action: $action,
            actor: $this->currentActor(),
            academy: $academy,
            subjectType: Academy::class,
            subjectId: $academy->id,
            subjectLabel: $academy->name,
            before: $this->redactor->redact($before),
            after: $this->redactor->redact($changes),
            ip: request()->ip(),
            userAgent: request()->userAgent(),
        );
    }

    private function currentActor(): ?User
    {
        $user = Auth::user();

        return $user instanceof User ? $user : null;
    }
}
