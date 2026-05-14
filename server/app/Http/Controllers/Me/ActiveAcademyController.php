<?php

declare(strict_types=1);

namespace App\Http\Controllers\Me;

use App\Authorization\RoleCapabilities;
use App\Http\Controllers\Controller;
use App\Http\Requests\Me\UpdateActiveAcademyRequest;
use App\Models\AcademyMembership;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;

/**
 * Read + switch the user's currently-selected academy (#427 / #718).
 *
 * Backed by `users.active_academy_id`. Reads return the active
 * academy + the user's role on it + the capability list the SPA
 * needs for the `*budojoCan` directive (sub-issue 9/9). Writes
 * accept an `academy_id` and validate the user has an active
 * membership in it before persisting.
 *
 * Returns 204 No Content on a read when the user hasn't been added
 * to any academy yet — handled by the SPA as "show the empty /
 * onboarding state".
 */
class ActiveAcademyController extends Controller
{
    public function show(Request $request): JsonResponse|Response
    {
        /** @var User $user */
        $user = $request->user();

        $membership = $user->activeMembership();
        if ($membership === null) {
            return response()->noContent();
        }

        return response()->json([
            'data' => $this->payload($membership),
        ]);
    }

    public function update(UpdateActiveAcademyRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        /** @var array{academy_id: int} $validated */
        $validated = $request->validated();

        $user->forceFill(['active_academy_id' => $validated['academy_id']])->save();

        // Re-resolve through activeMembership() so the response
        // payload matches the GET shape verbatim.
        $membership = $user->fresh()?->activeMembership();
        // PHPStan-friendly defensive check: the FormRequest already
        // guaranteed the membership exists.
        if ($membership === null) {
            return response()->json([
                'message' => 'Membership disappeared between validation and persistence.',
            ], 500);
        }

        return response()->json([
            'data' => $this->payload($membership),
        ]);
    }

    /**
     * Shared response shape between `show()` and `update()`. Carrying
     * `capabilities` on every read keeps the SPA's `*budojoCan`
     * directive synchronous — no separate round-trip on academy
     * switch.
     *
     * @return array<string, mixed>
     */
    private function payload(AcademyMembership $membership): array
    {
        // The membership's FK to `academies` is cascadeOnDelete, so
        // by the time we hit this helper the academy MUST exist —
        // a deleted academy would have cascaded away the membership
        // (and the FormRequest validation would have refused the
        // resolution anyway). The defensive null-check is for
        // PHPStan; in practice it never fires.
        $academy = $membership->academy()->firstOrFail();

        return [
            'academy' => [
                'id' => $academy->id,
                'name' => $academy->name,
                'slug' => $academy->slug,
                // Same shape as AcademyResource — `logo_url` is the
                // computed `Storage::disk('public')->url(logo_path)`,
                // not a real column.
                'logo_url' => $academy->logo_path !== null
                    ? Storage::disk('public')->url($academy->logo_path)
                    : null,
            ],
            'role' => $membership->role->value,
            'capabilities' => array_map(
                static fn ($cap) => $cap->value,
                RoleCapabilities::capabilitiesFor($membership->role),
            ),
        ];
    }
}
