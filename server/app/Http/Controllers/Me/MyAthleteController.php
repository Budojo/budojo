<?php

declare(strict_types=1);

namespace App\Http\Controllers\Me;

use App\Actions\Athlete\EnrollSelfAsAthleteAction;
use App\Actions\Athlete\GetSelfAthleteStateAction;
use App\Actions\Athlete\LeaveSelfAsAthleteAction;
use App\Exceptions\UserAlreadyAthleteElsewhereException;
use App\Http\Controllers\Controller;
use App\Http\Resources\AthleteResource;
use App\Models\Athlete;
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
 *   POST   /api/v1/me/athlete   → enroll
 *                                 - 201 on fresh row created
 *                                 - 200 on already-enrolled OR restored-from-trashed
 *   DELETE /api/v1/me/athlete   → leave, 204
 *
 * Both endpoints are **idempotent**. The POST status-code split
 * (`200` vs `201`) is computed BEFORE handing off to the Action,
 * using a `withTrashed()` lookup — that way a leave → re-enroll cycle
 * returns 200 (the row is restored, not freshly created), which is
 * the semantically correct REST response for an idempotent operation
 * that resurrected an existing resource.
 *
 * Both endpoints are open to any user with an active membership in
 * an academy — the capability matrix doesn't gate them because
 * "train at this academy" is a personal action, not a managerial
 * one. Athletes who haven't opted in to staff status (post-PR-B)
 * still need this surface to opt in.
 *
 * The 422 branch on POST and DELETE covers the "no active academy"
 * case (user has not been added to any academy yet, or hasn't picked
 * an active one). Both sides use the standard Laravel validation
 * envelope `{ message, errors }` so the SPA's existing 422 toast /
 * field-error wiring works without any custom branch. DELETE matches
 * POST symmetrically here — without it, the two endpoints would
 * silently disagree on the same precondition (Copilot review on #748).
 */
class MyAthleteController extends Controller
{
    public function __construct(
        private readonly EnrollSelfAsAthleteAction $enroll,
        private readonly GetSelfAthleteStateAction $getState,
        private readonly LeaveSelfAsAthleteAction $leave,
    ) {
    }

    public function store(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $academy = $user->activeAcademy();
        if ($academy === null) {
            return $this->noActiveAcademyResponse();
        }

        // 200 vs 201 is computed BEFORE the action runs, off a
        // withTrashed lookup: a row that exists in any state
        // (live OR soft-deleted) means the row is being reused,
        // not created. The Action then restores OR returns the
        // existing live row. Without the withTrashed branch a
        // leave → re-enroll cycle would mis-report 201 even
        // though the row was restored (Copilot review on #748).
        $existed = Athlete::withTrashed()
            ->where('academy_id', $academy->id)
            ->where('user_id', $user->id)
            ->where('is_self', true)
            ->exists();

        try {
            $athlete = $this->enroll->execute($user, $academy);
        } catch (UserAlreadyAthleteElsewhereException $e) {
            return response()->json([
                'message' => 'You are already an athlete in another academy. Leave that roster first.',
                'errors' => [
                    'user_id' => ['user_already_athlete_elsewhere'],
                ],
            ], 409);
        }

        return response()->json(
            ['data' => new AthleteResource($athlete)],
            $existed ? 200 : 201,
        );
    }

    /**
     * Read-only `enrolled` state for the caller's active academy
     * (#761). Backs the SPA's owner-as-athlete toggle initial state
     * without walking the paginated athletes index — see the Action
     * docblock for the bug history.
     *
     * Returns `{ data: { enrolled: false, athlete_id: null } }` with
     * 200 when the caller has no active academy, intentionally — the
     * toggle reads "no active academy" the same way as "active academy
     * but not enrolled" (both render the off state). Choosing 200 over
     * 422 keeps the SPA's call site free of a branch for a precondition
     * the read endpoint can satisfy on its own.
     */
    public function state(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $academy = $user->activeAcademy();
        if ($academy === null) {
            return response()->json([
                'data' => ['enrolled' => false, 'athlete_id' => null],
            ]);
        }

        return response()->json(['data' => $this->getState->execute($user, $academy)]);
    }

    public function destroy(Request $request): Response|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $academy = $user->activeAcademy();
        if ($academy === null) {
            return $this->noActiveAcademyResponse();
        }

        $this->leave->execute($user, $academy);

        return response()->noContent();
    }

    /**
     * Shared 422 envelope for the "user has no active academy"
     * branch. Wraps the message in the standard Laravel
     * validation-error envelope (`{ message, errors }`) so the
     * SPA's interceptor renders it through the same path as
     * every other 422 — Copilot review on #748.
     */
    private function noActiveAcademyResponse(): JsonResponse
    {
        return response()->json([
            'message' => 'No active academy. Pick one before enrolling.',
            'errors' => [
                'academy_id' => ['no_active_academy'],
            ],
        ], 422);
    }
}
