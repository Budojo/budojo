<?php

declare(strict_types=1);

namespace App\Http\Controllers\Athlete;

use App\Http\Controllers\Controller;
use App\Http\Resources\AthletePromotionResource;
use App\Models\Athlete;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Owner-facing read of an athlete's belt + stripe promotion history
 * (post-v2.9.0 feature: "voglio ricordarmi quando ho dato la striscia
 * a chi"). The athlete detail page renders the result as a date-
 * ordered timeline under the belt-and-status header.
 *
 * Authorization: same shape as the rest of the academy-scoped athlete
 * surface — caller must be the owner of the athlete's academy.
 * Athletes can read their OWN promotion history; that path lives
 * under `/me/promotions` (#TBD) and isn't this controller's concern.
 */
class AthletePromotionController extends Controller
{
    public function index(Request $request, Athlete $athlete): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->activeAcademyId() === null || $athlete->academy_id !== $user->activeAcademyId()) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $promotions = $athlete->promotions()->with('recordedBy:id,first_name,last_name')->paginate(20);

        return AthletePromotionResource::collection($promotions);
    }
}
