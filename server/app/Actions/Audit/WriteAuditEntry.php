<?php

declare(strict_types=1);

namespace App\Actions\Audit;

use App\Models\Academy;
use App\Models\AuditEntry;
use App\Models\User;

// Safety: never throws — write failure → Log::warning + null return; audit must not fail a user request.
class WriteAuditEntry
{
    /**
     * @param array<string, mixed>|null $before  Pre-mutation state, PII-redacted by the caller.
     * @param array<string, mixed>|null $after   Post-mutation state, PII-redacted by the caller.
     */
    public function execute(
        string $action,
        ?User $actor = null,
        ?Academy $academy = null,
        ?string $subjectType = null,
        ?int $subjectId = null,
        ?string $subjectLabel = null,
        ?array $before = null,
        ?array $after = null,
        ?string $ip = null,
        ?string $userAgent = null,
    ): ?AuditEntry {
        try {
            $entry = new AuditEntry([
                'actor_user_id' => $actor?->id,
                'actor_label' => $actor !== null ? $actor->full_name : 'system',
                'academy_id' => $academy?->id,
                'action' => $action,
                'subject_type' => $subjectType,
                'subject_id' => $subjectId,
                'subject_label' => $subjectLabel,
                'before' => $before,
                'after' => $after,
                'ip' => $ip,
                // Truncate defensively — bot UAs can blow past the
                // 512-char column. We don't need the tail for forensics.
                'user_agent' => $userAgent !== null ? mb_substr($userAgent, 0, 512) : null,
            ]);
            // $timestamps=false skips Eloquent's auto-fill; set explicitly for in-memory accuracy and TestNow.
            $entry->created_at = \Carbon\Carbon::now();
            $entry->save();

            return $entry;
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Failed to write audit entry', [
                'action' => $action,
                'actor_id' => $actor?->id,
                'academy_id' => $academy?->id,
                'subject' => $subjectType . ':' . $subjectId,
                'exception' => $e,
            ]);

            return null;
        }
    }
}
