<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Catalog of abilities a user can grant when minting an API token
 * (#431). The full list is the SPA's checkbox-grid contract; the
 * controller validates a posted subset against `all()`.
 *
 * Naming convention: `<resource>:<verb>`. Verbs are the coarse-
 * grained `read` / `write` — finer granularity (e.g.
 * `athletes:create` vs `athletes:update`) is deliberately deferred
 * until a real third-party integration asks for it. Today's surface
 * is roster-export + payment-mark workflows; both fit comfortably
 * inside read/write.
 *
 * **Session tokens vs API tokens** — session tokens (kind='session')
 * are always minted with the `*` wildcard ability for backwards
 * compatibility with every endpoint Sanctum-guarded today. Only
 * `kind='api'` tokens are scoped to the catalog here; the
 * controller MUST enforce the validation against the catalog.
 */
final class ApiTokenAbility
{
    public const string ATHLETES_READ = 'athletes:read';
    public const string ATHLETES_WRITE = 'athletes:write';
    public const string DOCUMENTS_READ = 'documents:read';
    public const string DOCUMENTS_WRITE = 'documents:write';
    public const string PAYMENTS_READ = 'payments:read';
    public const string PAYMENTS_WRITE = 'payments:write';
    public const string ATTENDANCE_READ = 'attendance:read';
    public const string ATTENDANCE_WRITE = 'attendance:write';

    /** @return array<int, string> */
    public static function all(): array
    {
        return [
            self::ATHLETES_READ,
            self::ATHLETES_WRITE,
            self::DOCUMENTS_READ,
            self::DOCUMENTS_WRITE,
            self::PAYMENTS_READ,
            self::PAYMENTS_WRITE,
            self::ATTENDANCE_READ,
            self::ATTENDANCE_WRITE,
        ];
    }
}
