<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * What a runtime profile (#1220) is able to offer (#1229, M11 #1218).
 *
 * The desktop is one process on one machine with no mail transport and no
 * browser push service. Everything that assumes a second human, an inbox or a
 * push endpoint is a capability the desktop profile simply does not have — and
 * the code behind it stays in place, tested, ready for a web deployment.
 *
 * A capability set rather than a boolean `isDesktop`, on purpose: sprinkling
 * `if (desktop)` through controllers is how a build target becomes a fork.
 * Callers ask "can this runtime send email?", never "am I on the desktop?".
 */
enum Capability: string
{
    /** Social feed, reactions, comments, events, shared videos, public profiles. */
    case Community = 'community';

    /** Athlete-side accounts: owner-issued invitations and the invite-accept flow. */
    case AthleteAccounts = 'athlete_accounts';

    /** Browser push over Web Push / VAPID. */
    case WebPush = 'web_push';

    /** An outbound mail transport exists — verification, invites, password reset. */
    case Email = 'email';

    /** The HaveIBeenPwned range check on new passwords (needs outbound HTTPS). */
    case PasswordBreachCheck = 'password_breach_check';
}
