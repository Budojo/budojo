<?php

declare(strict_types=1);

namespace App\Actions\Audit;

use App\Models\Academy;
use App\Models\AuditEntry;
use App\Models\User;

/**
 * Write a single audit-log row (#429). The single entry point for
 * every observer and controller that audits an action.
 *
 * Why an Action and not a static helper:
 * - Same Clean-Architecture discipline as the rest of the codebase
 *   (Actions, not Services). Observers can inject this via the
 *   container the same way controllers inject other Actions.
 * - The `execute()` signature accepts typed primitives (no Request
 *   dependency, no implicit `auth()->user()` reach); callers — be
 *   they HTTP-bound or queue-bound — pass what they have.
 *
 * Safety contract:
 * - This Action MUST NOT throw upward on a write failure. A logging
 *   failure cannot fail the user request. Internal try/catch logs
 *   the payload via `Log::warning` and returns null — callers can
 *   ignore the return value or branch on it for tests.
 *
 * The PII redaction lives in `App\Support\Audit\PiiRedactor` (the
 * caller is responsible for passing already-redacted `before`/`after`
 * arrays — keeps this action policy-free).
 */
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
            // Set created_at explicitly. Without it, $timestamps=false
            // makes Eloquent skip the field; the DB-level useCurrent()
            // default fills the column on disk, but the in-memory model
            // instance never sees it without a `refresh()` round-trip.
            // Setting it here keeps the returned model's created_at
            // populated immediately + lets Carbon::setTestNow() control
            // it in specs.
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
