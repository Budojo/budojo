<?php

declare(strict_types=1);

namespace App\Actions\Academy;

use App\Models\AcademyMembership;

/**
 * Discriminated union returned by `SwitchActiveAcademyAction::execute()`.
 *
 * Two states:
 *
 * - `membership !== null` → success path. `$membership` is the
 *   re-resolved active row that the caller should serialise.
 * - `revokedConcurrently === true` → the target membership was revoked
 *   between FormRequest validation and the transaction body (a
 *   legitimate TOCTOU race). Caller maps this to a 409 Conflict.
 *
 * Mutually exclusive — exactly one slot is populated. Drop-in for the
 * prior "throw sentinel exception" pattern (Clean Code § flag args /
 * exceptions-as-control-flow).
 */
final readonly class SwitchActiveAcademyResult
{
    private function __construct(
        public ?AcademyMembership $membership,
        public bool $revokedConcurrently,
    ) {
    }

    public static function switched(AcademyMembership $membership): self
    {
        return new self($membership, false);
    }

    public static function revokedConcurrently(): self
    {
        return new self(null, true);
    }
}
