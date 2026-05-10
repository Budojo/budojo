<?php

declare(strict_types=1);

namespace App\Actions\Auth;

use App\Models\LoginAttempt;

/**
 * Append-only writer for the `login_attempts` audit log (#430).
 *
 * Called from `LoginController` for EVERY authentication attempt —
 * success or failure. The user-facing "Login history" panel reads
 * from this table; the security signal value depends on having
 * BOTH outcomes logged (a failed-login burst is the high-signal
 * compromise event the user wants to detect).
 *
 * **Privacy**: `ip` and `userAgent` are personal data. Storage is
 * justified by Art. 6 (1) (f) GDPR (legitimate interest in security
 * and audit) and disclosed in `/privacy` § Sicurezza. Retention is
 * 90 days, enforced by the
 * `budojo:purge-expired-login-attempts` Artisan command.
 */
class RecordLoginAttemptAction
{
    /**
     * Cap user-agent strings at 1024 chars to bound row size — see
     * the column type in the migration. A real browser UA is 200-400
     * chars; 1024 is a generous ceiling that catches malformed /
     * malicious headers without truncating any legitimate one.
     */
    private const USER_AGENT_MAX_LENGTH = 1024;

    public function execute(
        ?int $userId,
        string $emailAttempted,
        ?string $ip,
        ?string $userAgent,
        bool $success,
    ): void {
        LoginAttempt::query()->create([
            'user_id' => $userId,
            'email_attempted' => $emailAttempted,
            'ip_address' => $ip,
            'user_agent' => $userAgent === null
                ? null
                : substr($userAgent, 0, self::USER_AGENT_MAX_LENGTH),
            'success' => $success,
        ]);
    }
}
