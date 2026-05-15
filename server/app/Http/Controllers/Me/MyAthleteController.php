<?php

declare(strict_types=1);

namespace App\Http\Controllers\Me;

use App\Actions\Athlete\EnrollSelfAsAthleteAction;
use App\Actions\Athlete\LeaveSelfAsAthleteAction;
use App\Http\Controllers\Controller;
use App\Http\Resources\AthleteResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Self-enroll / self-leave the caller as an athlete in their own
 * academy (#748, part of epic #747). Two endpoints, both keyed off
 * the caller's *active* academy (i.e. the one selected via
 * `users.active_academy_id`, post-multi-user #427/#428):
 *
 *   POST   /api/v1/me/athlete   → enroll, 201 with AthleteResource
 *   DELETE /api/v1/me/athlete   → leave, 204
 *
 * Both endpoints are **idempotent**:
 *
 *   - POST on an already-enrolled state returns 200 with the
 *     existing row (no second row, no error).
 *   - DELETE on a not-enrolled state returns 204 (no error).
 *
 * Both endpoints are open to any user with an active membership in
 * an academy — the capability matrix doesn't gate them because
 * "train at this academy" is a personal action, not a managerial
 * one. Athletes who haven't opted in to staff status (post-PR-B)
 * still need this surface to opt in.
 *
 * The 422 branch on POST covers the "no active academy" case (user
 * has not been added to any academy yet, or hasn't picked an
 * active one). The SPA never reaches this endpoint from a state
 * that would trigger it — the toggle is gated by the active-academy
 * resolver — but the server-side guard remains as the boundary.
 */
class MyAthleteController extends Controller
{
    public function __construct(
        private readonly EnrollSelfAsAthleteAction $enroll,
        private readonly LeaveSelfAsAthleteAction $leave,
    ) {
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $academy = $user->activeAcademy();
        if ($academy === null) {
            return response()->json([
                'message' => 'No active academy. Pick one before enrolling.',
            ], 422);
        }

        $existed = $user->athleteIn($academy) !== null;

        $athlete = $this->enroll->execute($user, $academy);

        return response()->json(
            ['data' => new AthleteResource($athlete)],
            $existed ? 200 : 201,
        );
    }

    public function destroy(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();

        $academy = $user->activeAcademy();
        if ($academy === null) {
            return response()->noContent();
        }

        $this->leave->execute($user, $academy);

        return response()->noContent();
    }
}
