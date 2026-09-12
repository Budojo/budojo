<?php

declare(strict_types=1);

namespace App\Http\Controllers\Stats;

use App\Actions\Stats\AthleteSyllabusCoverageAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Stats\AthleteSyllabusCoverageRequest;
use App\Models\Athlete;
use Illuminate\Http\JsonResponse;

/**
 * What this athlete has seen of the programme, and what they missed (#1567).
 *
 * Its own controller rather than another method on `StatsController`: that one
 * lives behind the owner-only stats group, and this read belongs to whoever
 * can already see the athlete's attendance.
 */
class AthleteSyllabusCoverageController extends Controller
{
    public function __construct(
        private readonly AthleteSyllabusCoverageAction $coverage,
    ) {
    }

    public function __invoke(AthleteSyllabusCoverageRequest $request, Athlete $athlete): JsonResponse
    {
        return response()->json([
            'data' => $this->coverage->execute($athlete, $request->seasonsBack()),
        ]);
    }
}
