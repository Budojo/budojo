<?php

declare(strict_types=1);

namespace App\Http\Controllers\Stats;

use App\Actions\Stats\TopicExposureAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Stats\TopicExposureRequest;
use App\Models\SyllabusTopic;
use Illuminate\Http\JsonResponse;

/**
 * Who has seen one technique this season (#1745) — the drill-down behind a
 * row of the coverage report.
 */
class TopicExposureController extends Controller
{
    public function __construct(
        private readonly TopicExposureAction $exposure,
    ) {
    }

    public function __invoke(TopicExposureRequest $request, SyllabusTopic $syllabusTopic): JsonResponse
    {
        return response()->json([
            'data' => $this->exposure->execute($syllabusTopic, $request->seasonsBack()),
        ]);
    }
}
