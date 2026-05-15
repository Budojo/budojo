<?php

declare(strict_types=1);

namespace App\Actions\Athlete;

use App\Models\Academy;
use App\Models\Athlete;
use App\Models\User;

/**
 * Resolve whether a user is currently self-enrolled as an athlete in
 * a given academy, and if so the row's id. Backs the SPA's
 * owner-as-athlete toggle (#750) — the toggle needs a deterministic
 * "am I enrolled?" answer regardless of roster size.
 *
 * The previous implementation (`MyAthleteService::state()` consumer)
 * walked one page of `GET /api/v1/athletes` looking for a row with
 * `is_self === true`. `AthleteController@index` ignores the `per_page`
 * query parameter and always paginates 20 items, so on academies with
 * a roster larger than 20 the self-row could be off the first page
 * and the toggle would silently report `enrolled: false` (#761,
 * Copilot review on #754).
 *
 * This Action narrows the lookup to (academy_id, user_id, is_self=true)
 * directly — there is at most one such row per (academy, user) so the
 * result is unambiguous. Soft-deleted rows (a previous self-leave) are
 * intentionally excluded: from the SPA's point of view "I left" =
 * "not enrolled", and the LeaveSelfAsAthleteAction soft-delete is what
 * makes "leave then re-enroll" preserve attendance / promotion
 * history.
 *
 * @phpstan-type SelfAthleteState array{enrolled: bool, athlete_id: int|null}
 */
class GetSelfAthleteStateAction
{
    /**
     * @return SelfAthleteState
     */
    public function execute(User $user, Academy $academy): array
    {
        /** @var Athlete|null $row */
        $row = Athlete::query()
            ->where('academy_id', $academy->id)
            ->where('user_id', $user->id)
            ->where('is_self', true)
            ->first(['id']);

        return [
            'enrolled' => $row !== null,
            'athlete_id' => $row?->id,
        ];
    }
}
