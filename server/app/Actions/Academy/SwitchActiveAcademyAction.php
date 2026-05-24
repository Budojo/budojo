<?php

declare(strict_types=1);

namespace App\Actions\Academy;

use App\Models\AcademyMembership;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Switches the authenticated user's active academy (#990 — controller-
 * bloat extraction).
 *
 * Closes the FormRequest → save() TOCTOU window: re-checks the
 * membership inside a `DB::transaction` with `lockForUpdate()` so a
 * concurrent revoke (which UPDATEs `revoked_at`) blocks until this
 * transaction commits. Without the lock, the read returned a non-
 * revoked row that could be revoked between the SELECT and the user
 * save, and the pointer would still land at a revoked membership.
 *
 * Why this lives in an Action: the controller used to inline the
 * transaction AND throw a string-sentinel exception to signal the
 * race-detection branch. That's two anti-patterns (Clean Code § flag
 * args / exceptions-as-control-flow). The Action returns a
 * discriminated `SwitchActiveAcademyResult` so the caller branches on
 * a typed result instead of catching a string-coded exception.
 */
class SwitchActiveAcademyAction
{
    public function execute(User $user, int $targetAcademyId): SwitchActiveAcademyResult
    {
        return DB::transaction(function () use ($user, $targetAcademyId): SwitchActiveAcademyResult {
            /** @var AcademyMembership|null $active */
            $active = $user->memberships()
                ->where('academy_id', $targetAcademyId)
                ->whereNull('revoked_at')
                ->lockForUpdate()
                ->first();

            if ($active === null) {
                // Concurrent revoke between FormRequest validation and
                // here. Caller maps to 409. `report()` surfaces the
                // rare race in Sentry / the log channel — preserves
                // the observability the pre-refactor controller had
                // via `report($e)` on the sentinel-exception path.
                report(new \RuntimeException('membership_revoked_concurrently'));

                return SwitchActiveAcademyResult::revokedConcurrently();
            }

            $user->forceFill(['active_academy_id' => $targetAcademyId])->save();

            return SwitchActiveAcademyResult::switched($active);
        });
    }
}
