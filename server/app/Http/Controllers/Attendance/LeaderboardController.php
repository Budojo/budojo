<?php

declare(strict_types=1);

namespace App\Http\Controllers\Attendance;

use App\Actions\Engagement\GetMonthlyLeaderboardAction;
use App\Http\Controllers\Controller;
use App\Models\Academy;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Monthly mat-hours leaderboard endpoint (#962). Returns the top 5
 * athletes by session count for the academy + month. Defaults to
 * the current month when `month` is omitted.
 *
 * Available to owners (scoped via active academy) AND athletes
 * (scoped via their linked athlete row's academy). For athletes the
 * response also flags the caller's own row with `is_self: true` so
 * the SPA can highlight it visually.
 */
class LeaderboardController extends Controller
{
    public function __construct(
        private readonly GetMonthlyLeaderboardAction $action,
    ) {
    }

    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $academyId = $this->resolveAcademyId($user);
        if ($academyId === null) {
            return response()->json(['message' => 'No academy context for caller.'], 404);
        }
        /** @var Academy $academy */
        $academy = Academy::query()->findOrFail($academyId);

        $monthRaw = $request->query('month');
        $month = $this->parseMonth($monthRaw);
        if ($month === null) {
            return response()->json(['message' => 'Malformed month parameter.'], 422);
        }

        $selfAthleteId = $user->athlete?->id;
        $rows = $this->action->execute($academy, $month, $selfAthleteId);

        return response()->json([
            'data' => $rows,
            'meta' => [
                'month' => $month->format('Y-m'),
            ],
        ]);
    }

    private function resolveAcademyId(User $user): ?int
    {
        // Owner persona — scoped via active academy. Athlete persona —
        // via the linked athlete row. Owners without active academy
        // and athletes without a linked row both 404.
        if ($user->isOwner()) {
            return $user->activeAcademyId();
        }

        return $user->athlete?->academy_id;
    }

    private function parseMonth(mixed $raw): ?CarbonImmutable
    {
        if ($raw === null || $raw === '') {
            // Default to current month.
            return CarbonImmutable::now()->startOfMonth();
        }
        if (! \is_string($raw)) {
            return null;
        }
        if (! preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $raw)) {
            return null;
        }

        try {
            $parsed = CarbonImmutable::createFromFormat('!Y-m', $raw);
        } catch (\Throwable) {
            return null;
        }

        return $parsed?->startOfMonth();
    }
}
