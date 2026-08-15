<?php

declare(strict_types=1);

namespace App\Enums;

use App\Support\Runtime;

/**
 * What a `personal_access_tokens.kind` row is (#431 introduced the column,
 * #1227 the desktop case).
 *
 *  - Session — a browser sign-in on the hosted app; listed under "Active
 *    sessions", revocable there.
 *  - Api     — a user-minted integration token; abilities-scoped, listed
 *    under "API tokens", never in the sessions list.
 *  - Desktop — the sign-in of the Electron shell (#1227): minted by a normal
 *    login on the desktop profile, held encrypted in the OS keychain by the
 *    shell, and long-lived on purpose — that machine *is* the session. Shown
 *    with the sessions so it can be revoked like one.
 */
enum TokenKind: string
{
    case Session = 'session';
    case Api = 'api';
    case Desktop = 'desktop';

    /** The kind a sign-in on this runtime produces. */
    public static function forSignIn(): self
    {
        return Runtime::isDesktop() ? self::Desktop : self::Session;
    }

    /**
     * Kinds that are a human's sign-in — what "Active sessions" lists and
     * "log out everywhere else" revokes.
     *
     * @return list<string>
     */
    public static function sessionLike(): array
    {
        return [self::Session->value, self::Desktop->value];
    }
}
