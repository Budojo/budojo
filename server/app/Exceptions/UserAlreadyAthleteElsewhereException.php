<?php

declare(strict_types=1);

namespace App\Exceptions;

use App\Models\User;

/**
 * The caller can't self-enroll because they already have an athlete
 * row in some other academy (#748). Mapped by the controller to a
 * 409 Conflict with a clean error code so the SPA can surface the
 * right toast.
 *
 * Today (V1) the system never produces this state organically — an
 * owner is `role = owner` and has no athlete row, an athlete is
 * `role = athlete` and has one. The exception is a defensive guard
 * for a multi-role future + the manual data fix-up path where a
 * row could legitimately exist (e.g. a community pre-invite that
 * landed before the self-enrolment flow).
 */
class UserAlreadyAthleteElsewhereException extends \RuntimeException
{
    public function __construct(
        public readonly User $user,
        public readonly int $existingAthleteId,
        public readonly int $existingAcademyId,
    ) {
        parent::__construct(
            'User ' . $user->id . ' already has athlete row ' . $existingAthleteId
            . ' in academy ' . $existingAcademyId . '.',
        );
    }
}
