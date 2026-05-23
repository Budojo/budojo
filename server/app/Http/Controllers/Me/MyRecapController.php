<?php

declare(strict_types=1);

namespace App\Http\Controllers\Me;

use App\Actions\Engagement\BuildWeeklyRecapAction;
use App\Http\Controllers\Controller;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Athlete-portal weekly recap (#960). `GET /api/v1/me/recap?week=YYYY-MM-DD`
 * — `week` is the Monday start date of the recap window. Returns the
 * recap data used by the push tap-through page + the share card.
 *
 * 404 when the caller has no linked athlete row; 422 when the week
 * param is malformed or not a Monday.
 */
class MyRecapController extends Controller
{
    public function __construct(
        private readonly BuildWeeklyRecapAction $action,
    ) {
    }

    public function show(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $athlete = $user->athlete;
        if ($athlete === null) {
            return response()->json(['message' => 'No athlete profile found.'], 404);
        }

        $weekRaw = $request->query('week');
        if (! \is_string($weekRaw) || $weekRaw === '') {
            return response()->json(['message' => 'Missing week parameter.'], 422);
        }
        if (! preg_match('/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/', $weekRaw)) {
            return response()->json(['message' => 'Malformed week parameter.'], 422);
        }

        try {
            $weekStart = CarbonImmutable::createFromFormat('!Y-m-d', $weekRaw);
        } catch (\Throwable) {
            return response()->json(['message' => 'Malformed week parameter.'], 422);
        }
        if ($weekStart === null || $weekStart->format('Y-m-d') !== $weekRaw) {
            return response()->json(['message' => 'Malformed week parameter.'], 422);
        }
        // ISO-week constraint: the recap window starts on a Monday.
        // Reject non-Monday inputs so SPA bugs don't silently shift the
        // window by N days.
        if ($weekStart->dayOfWeek !== CarbonImmutable::MONDAY) {
            return response()->json(['message' => 'Week parameter must be a Monday.'], 422);
        }

        $recap = $this->action->execute($athlete, $weekStart);

        return response()->json([
            'data' => [
                'iso_week_start' => $recap->isoWeekStart,
                'sessions' => $recap->sessions,
                'hours' => $recap->hours,
                'partners' => $recap->partners,
            ],
        ]);
    }
}
