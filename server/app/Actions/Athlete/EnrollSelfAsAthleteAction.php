<?php

declare(strict_types=1);

namespace App\Actions\Athlete;

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Enroll a user as an athlete in their own academy (#748, part of
 * epic #747). The created row carries `is_self = true`, which flips
 * the row across the codebase:
 *
 *   - Payment digests skip it (the owner / staff member isn't billed).
 *   - The regular `DELETE /api/v1/athletes/{id}` rejects 403 — leaving
 *     the roster goes through `LeaveSelfAsAthleteAction` (soft-delete,
 *     history preserved).
 *   - The roster UI renders an `Owner` chip next to the name (PR-B).
 *
 * The action is **idempotent**: calling it twice for the same
 * (user, academy) returns the existing row, restoring it if it had
 * been soft-deleted by a previous LeaveSelfAsAthleteAction call.
 * That last property is what makes "leave then re-enroll" preserve
 * the attendance / promotion history — the underlying DB row is the
 * same.
 *
 * The default attribute block (White belt, Active status, joined_at
 * = today) mirrors what a fresh `Athlete::factory()->create()` would
 * generate, so test fixtures stay symmetric with the production
 * shape. First and last name are taken from the user's profile —
 * the SPA's roster has zero affordance for an owner-as-athlete row
 * with a different display name from the underlying user account.
 */
class EnrollSelfAsAthleteAction
{
    public function execute(User $user, Academy $academy): Athlete
    {
        return DB::transaction(function () use ($user, $academy): Athlete {
            // Idempotency lookup includes soft-deleted rows: a previous
            // LeaveSelfAsAthleteAction soft-deleted; re-enrolling
            // restores rather than orphaning.
            /** @var Athlete|null $existing */
            $existing = Athlete::withTrashed()
                ->where('academy_id', $academy->id)
                ->where('user_id', $user->id)
                ->where('is_self', true)
                ->lockForUpdate()
                ->first();

            if ($existing !== null) {
                if ($existing->trashed()) {
                    $existing->restore();
                    $existing->update([
                        'status' => AthleteStatus::Active,
                    ]);
                }

                return $existing->fresh() ?? $existing;
            }

            return $academy->athletes()->create([
                'user_id' => $user->id,
                'is_self' => true,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'email' => $user->email,
                'belt' => Belt::White,
                'stripes' => 0,
                'status' => AthleteStatus::Active,
                'joined_at' => now()->toDateString(),
            ]);
        });
    }
}
