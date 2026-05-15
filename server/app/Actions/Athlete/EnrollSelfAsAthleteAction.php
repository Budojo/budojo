<?php

declare(strict_types=1);

namespace App\Actions\Athlete;

use App\Enums\AthleteStatus;
use App\Enums\Belt;
use App\Exceptions\UserAlreadyAthleteException;
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
                    // Refresh the row's user-mirrored columns on restore.
                    // If the user changed their first/last/email between
                    // leave and re-enroll (a perfectly normal flow over
                    // a long pause), the trashed row's snapshot is stale.
                    // Mirror the fresh-create branch below so the visible
                    // identity always matches the current user profile
                    // (Copilot review on #748).
                    $existing->update([
                        'first_name' => $user->first_name,
                        'last_name' => $user->last_name,
                        'email' => $user->email,
                        'status' => AthleteStatus::Active,
                    ]);
                }

                return $existing->fresh() ?? $existing;
            }

            // Defensive guard against the UNIQUE constraint on
            // `athletes.user_id` (`2026_05_05_160100_add_user_id_to_athletes_table`,
            // M7 #445): a user globally has AT MOST one athlete row
            // across all academies. If the caller already has a row
            // somewhere else (e.g. invited as a regular athlete by a
            // different academy) the bare `create()` below would 500
            // on UNIQUE collision. Detect upfront so the controller
            // can map to a clean 409 instead. Copilot review on #748.
            $foreignRow = Athlete::withTrashed()
                ->where('user_id', $user->id)
                ->first();
            if ($foreignRow !== null) {
                throw new UserAlreadyAthleteException(
                    user: $user,
                    existingAthleteId: $foreignRow->id,
                    existingAcademyId: $foreignRow->academy_id,
                );
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
