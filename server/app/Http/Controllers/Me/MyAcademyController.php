<?php

declare(strict_types=1);

namespace App\Http\Controllers\Me;

use App\Actions\Me\GetMyAcademyAction;
use App\Http\Controllers\Controller;
use App\Http\Resources\MeAcademyResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Athlete-portal view onto the caller's academy (#618, M7 PR-D slice 2).
 *
 * `GET /api/v1/me/academy` — single endpoint, role-agnostic. The
 * Action resolves the academy from the user's role; the resource
 * adds an `owner` block carrying public contact info so the athlete
 * knows whom to reach out to.
 *
 * Why separate from `AcademyController::show`: that endpoint is
 * owner-scoped and 404s for athletes (who don't own an academy).
 * Sharing it would require a branching flag in the controller; two
 * slim entry points are easier to reason about.
 */
class MyAcademyController extends Controller
{
    public function __construct(
        private readonly GetMyAcademyAction $getMyAcademy,
    ) {
    }

    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $this->getMyAcademy->execute($user);

        if ($academy === null) {
            return response()->json(['message' => 'No academy found.'], 404);
        }

        return response()->json(['data' => new MeAcademyResource($academy)]);
    }
}
