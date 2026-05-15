<?php

declare(strict_types=1);

namespace App\Exceptions;

use App\Models\User;

/**
 * The caller can't self-enroll because they already have an athlete
 * row tied to their user id (#748). Mapped by the controller to a
 * 409 Conflict with a clean error code so the SPA can surface the
 * right toast.
 *
 * **Scope is global, not cross-academy.** The check in
 * `EnrollSelfAsAthleteAction` is keyed on `user_id` alone — it trips
 * regardless of whether the conflicting row lives in the current
 * active academy or in a different one. The class was previously
 * named `UserAlreadyAthleteElsewhereException`, which read as if the
 * conflict could only arise across academies; that name + the
 * matching "in another academy" 409 message were inconsistent with
 * the actual implementation (Copilot review on the v2.18.0 release
 * PR, tracked in #764). The new name + message reflect the global
 * `user_id` scope honestly.
 *
 * Today (V1) the system never produces this state organically — an
 * owner is `role = owner` and has no athlete row, an athlete is
 * `role = athlete` and has one. The exception is a defensive guard
 * for a multi-role future + the manual data fix-up path where a row
 * could legitimately exist (e.g. a community pre-invite that landed
 * before the self-enrolment flow).
 */
class UserAlreadyAthleteException extends \RuntimeException
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
