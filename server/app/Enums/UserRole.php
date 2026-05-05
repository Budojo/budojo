<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Discriminator between the two user personas in Budojo (#445).
 *
 * - `Owner` is the academy owner / manager — the persona Budojo has
 *   served since v1.0. Every user that registers via the public
 *   `/auth/register` endpoint is created with this role.
 * - `Athlete` is created exclusively through the token-signed invite
 *   flow that the academy owner triggers from the athlete detail page
 *   (M7 PR-B / PR-C). There is no public path to becoming an athlete
 *   — this is a deliberate security boundary documented in
 *   `docs/specs/m7-athlete-login.md` § "Hard rules".
 *
 * Backed string enum so the value lands in the DB column verbatim
 * and the SPA can mirror the union as a typed string literal.
 */
enum UserRole: string
{
    case Owner = 'owner';
    case Athlete = 'athlete';
}
