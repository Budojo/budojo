<?php

declare(strict_types=1);

namespace App\Http\Controllers\Stats;

use App\Actions\Stats\MonthlyAttendanceStatsAction;
use App\Actions\Stats\MonthlyPaymentsStatsAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Stats\MonthsRangeRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;

class StatsController extends Controller
{
    public function __construct(
        private readonly MonthlyAttendanceStatsAction $monthlyAttendanceAction,
        private readonly MonthlyPaymentsStatsAction $monthlyPaymentsAction,
    ) {
    }

    public function attendanceMonthly(MonthsRangeRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->academy;

        // Defensive — MonthsRangeRequest::authorize() already gates this,
        // but PHPStan can't follow that invariant cross-class.
        if ($academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $rows = $this->monthlyAttendanceAction->execute($academy, $request->months());

        return response()->json(['data' => $rows]);
    }

    public function paymentsMonthly(MonthsRangeRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->academy;

        if ($academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $rows = $this->monthlyPaymentsAction->execute($academy, $request->months());

        return response()->json(['data' => $rows]);
    }
}
