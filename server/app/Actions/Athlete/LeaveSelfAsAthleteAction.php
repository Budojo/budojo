<?php

declare(strict_types=1);

namespace App\Actions\Athlete;

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Soft-delete the user's owner-as-athlete row in an academy (#748,
 * part of epic #747). Returns the trashed row when it actually
 * existed, `null` when there was nothing to leave — `false`-style
 * no-op semantics keep the caller idempotent (the `DELETE
 * /api/v1/me/athlete` endpoint returns 204 regardless).
 *
 * Soft-delete on purpose: attendance, payments (none in this row's
 * case, but the column exists), promotion history all FK back to
 * `athletes.id` and survive the trash. A future re-enroll via
 * `EnrollSelfAsAthleteAction` restores the SAME row with the SAME
 * id, so the history is preserved seamlessly.
 */
class LeaveSelfAsAthleteAction
{
    public function execute(User $user, Academy $academy): ?Athlete
    {
        return DB::transaction(function () use ($user, $academy): ?Athlete {
            /** @var Athlete|null $existing */
            $existing = Athlete::query()
                ->where('academy_id', $academy->id)
                ->where('user_id', $user->id)
                ->where('is_self', true)
                ->lockForUpdate()
                ->first();

            if ($existing === null) {
                return null;
            }

            $existing->delete();

            return $existing;
        });
    }
}
