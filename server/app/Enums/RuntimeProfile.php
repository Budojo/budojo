<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Where this instance of Budojo is running (#1220, part of the M11 desktop
 * migration #1218).
 *
 *  - Web — the hosted SPA + API. Multi-user surfaces are live, mail goes out
 *    over SMTP, push travels over Web Push / VAPID.
 *  - Desktop — one process on one machine, inside the Electron shell. There
 *    is no second user to invite, no browser push service to reach, and no
 *    queue worker to drain jobs.
 *
 * Kept as an enum rather than a boolean because the difference is a *set of
 * capabilities*, not a flag. A boolean invites `if ($isDesktop)` to sprout at
 * every call site, and that is how a build target quietly becomes a fork.
 */
enum RuntimeProfile: string
{
    case Web = 'web';
    case Desktop = 'desktop';
}
