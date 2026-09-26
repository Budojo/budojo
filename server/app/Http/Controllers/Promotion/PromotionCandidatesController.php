<?php

declare(strict_types=1);

namespace App\Http\Controllers\Promotion;

use App\Actions\Promotion\GetPromotionCandidatesAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Promotion\PromotionCandidatesRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;

/**
 * The athletes who may be ready for their next step (#1841).
 */
class PromotionCandidatesController extends Controller
{
    public function __construct(
        private readonly GetPromotionCandidatesAction $candidates,
    ) {
    }

    public function __invoke(PromotionCandidatesRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->activeAcademy();

        // Defensive — the request's authorize() already gates this, but
        // PHPStan can't follow that invariant cross-class.
        if ($academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return response()->json(['data' => $this->candidates->execute($academy)]);
    }
}
