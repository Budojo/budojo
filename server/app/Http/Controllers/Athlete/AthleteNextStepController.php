<?php

declare(strict_types=1);

namespace App\Http\Controllers\Athlete;

use App\Actions\Promotion\GetAthleteNextStepAction;
use App\Http\Controllers\Controller;
use App\Models\Athlete;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * One athlete's next step on the ladder (#2045): what the phone's promotion
 * sheet proposes. `data` is null at the top of the ladder.
 */
class AthleteNextStepController extends Controller
{
    public function __construct(
        private readonly GetAthleteNextStepAction $nextStep,
    ) {
    }

    public function __invoke(Request $request, Athlete $athlete): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->activeAcademy();

        // The same academy-scope gate as the promotion history beside it.
        if ($academy === null || $athlete->academy_id !== $academy->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return response()->json(['data' => $this->nextStep->execute($athlete, $academy)]);
    }
}
