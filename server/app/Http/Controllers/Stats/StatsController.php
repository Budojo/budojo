<?php

declare(strict_types=1);

namespace App\Http\Controllers\Stats;

use App\Actions\Stats\AtRiskAthletesAction;
use App\Actions\Stats\AthleteAgeBandsAction;
use App\Actions\Stats\CertificateComplianceAction;
use App\Actions\Stats\DailyAttendanceStatsAction;
use App\Actions\Stats\MonthlyPaymentsStatsAction;
use App\Actions\Stats\SyllabusCoverageAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Stats\AtRiskAthletesRequest;
use App\Http\Requests\Stats\DailyAttendanceRangeRequest;
use App\Http\Requests\Stats\MonthsRangeRequest;
use App\Http\Requests\Stats\SyllabusCoverageRequest;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StatsController extends Controller
{
    public function __construct(
        private readonly DailyAttendanceStatsAction $dailyAttendanceAction,
        private readonly MonthlyPaymentsStatsAction $monthlyPaymentsAction,
        private readonly AthleteAgeBandsAction $ageBandsAction,
        private readonly SyllabusCoverageAction $syllabusCoverageAction,
        private readonly CertificateComplianceAction $certificateComplianceAction,
        private readonly AtRiskAthletesAction $atRiskAthletesAction,
    ) {
    }

    public function attendanceDaily(DailyAttendanceRangeRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->activeAcademy();

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
        $academy = $user->activeAcademy();

        if ($academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $rows = $this->monthlyPaymentsAction->execute($academy, $request->months());

        return response()->json(['data' => $rows]);
    }

    /**
     * What the programme says the academy would teach this season, against
     * what it actually did (#1565).
     */
    public function syllabusCoverage(SyllabusCoverageRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->activeAcademy();

        if ($academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return response()->json([
            'data' => $this->syllabusCoverageAction->execute(
                $academy,
                $request->seasonsBack(),
                $request->kind(),
            ),
        ]);
    }

    public function ageBands(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->activeAcademy();

        if ($academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $payload = $this->ageBandsAction->execute($academy);

        return response()->json(['data' => $payload]);
    }

    /**
     * Who is drifting, against their own attendance (#1728). Not cached: a
     * presence ticked tonight must take someone off the list tonight.
     */
    public function atRisk(AtRiskAthletesRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->activeAcademy();

        if ($academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return response()->json($this->atRiskAthletesAction->execute($academy, CarbonImmutable::today()));
    }

    /** How many active athletes a medical certificate covers (#1732). */
    public function documentsCompliance(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->activeAcademy();

        if ($academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return response()->json(['data' => $this->certificateComplianceAction->execute($academy)]);
    }
}
