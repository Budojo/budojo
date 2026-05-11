<?php

declare(strict_types=1);

namespace App\Http\Controllers\Me;

use App\Actions\Attendance\GetAthleteAttendanceAction;
use App\Http\Controllers\Controller;
use App\Http\Resources\AttendanceRecordResource;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * Athlete-portal attendance history (#618 / M7 PR-D slice 3).
 *
 * `GET /api/v1/me/attendance` — returns the authenticated athlete's
 * attendance records in the optional `[from, to]` date window. Owners
 * hitting this endpoint get a 403: owners don't HAVE personal
 * attendance (they're not on the mat as students), and the existing
 * owner-side `/athletes/{id}/attendance` is the right surface for
 * reading any athlete's history.
 *
 * Reuses `GetAthleteAttendanceAction` (already built for the owner
 * surface) so the read semantics + ordering match across both
 * personas.
 */
class MyAttendanceController extends Controller
{
    public function __construct(
        private readonly GetAthleteAttendanceAction $action,
    ) {
    }

    public function index(Request $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $athlete = $user->athlete;
        if ($athlete === null) {
            return response()->json(['message' => 'No athlete profile found.'], 404);
        }

        $from = $this->parseOptionalDate($request, 'from');
        $to = $this->parseOptionalDate($request, 'to');

        if ($from !== null && $to !== null && $from->greaterThan($to)) {
            return response()->json(['message' => 'Invalid date range.'], 422);
        }

        $records = $this->action->execute($athlete, $from, $to);

        return AttendanceRecordResource::collection($records);
    }

    /**
     * Parse an optional `YYYY-MM-DD` query param. Returns null when
     * absent; 422-friendly null when the value can't be parsed (the
     * controller maps that to the `Invalid date range.` envelope
     * along with the cross-field check).
     */
    private function parseOptionalDate(Request $request, string $key): ?CarbonImmutable
    {
        $raw = $request->query($key);
        if (! \is_string($raw) || $raw === '') {
            return null;
        }

        try {
            return CarbonImmutable::createFromFormat('Y-m-d', $raw) ?: null;
        } catch (\Throwable) {
            return null;
        }
    }
}
