<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Per-membership role within an academy (#427 / #714).
 *
 * **Distinct from `UserRole`** (which lives on `users.role` and is the
 * persona discriminator — owner vs athlete). `UserRole::Owner` means
 * "this user can register / run an academy"; `MembershipRole::Owner`
 * means "this user is the top-level admin of THIS specific academy".
 * A single user can hold different `MembershipRole` values across
 * different academies — they might be `owner` of academy A and
 * `instructor` of academy B.
 *
 * The order of the cases below matches the row order of the
 * capability matrix in `docs/specs/multi-user.md` § 4 (from most
 * privileged to least). Adding a new role means: append a case here,
 * add a column to the matrix, update `RoleCapabilities` (sub-issue
 * 2/9). The PEST regression on the matrix shape will fail until all
 * three sides line up.
 */
enum MembershipRole: string
{
    case Owner = 'owner';
    case Admin = 'admin';
    case Instructor = 'instructor';
    case Assistant = 'assistant';
}
