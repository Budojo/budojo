<?php

declare(strict_types=1);

namespace App\Http\Controllers\Stats;

use App\Actions\Stats\AthleteAgeBandsAction;
use App\Actions\Stats\DailyAttendanceStatsAction;
use App\Actions\Stats\MonthlyPaymentsStatsAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Stats\DailyAttendanceRangeRequest;
use App\Http\Requests\Stats\MonthsRangeRequest;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StatsController extends Controller
{
    public function __construct(
        private readonly DailyAttendanceStatsAction $dailyAttendanceAction,
        private readonly MonthlyPaymentsStatsAction $monthlyPaymentsAction,
        private readonly AthleteAgeBandsAction $ageBandsAction,
    ) {
    }

    public function attendanceDaily(DailyAttendanceRangeRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->academy;

        // Defensive — DailyAttendanceRangeRequest::authorize() already gates this,
        // but PHPStan can't follow that invariant cross-class.
        if ($academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $rows = $this->dailyAttendanceAction->execute($academy, $request->months());

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

    public function ageBands(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->academy;

        if ($academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $payload = $this->ageBandsAction->execute($academy);

        return response()->json(['data' => $payload]);
    }
}
