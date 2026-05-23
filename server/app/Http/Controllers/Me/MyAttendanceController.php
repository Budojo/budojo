<?php

declare(strict_types=1);

namespace App\Http\Controllers\Me;

use App\Actions\Attendance\GetAthleteAttendanceAction;
use App\Actions\Attendance\GetTodayPeersAction;
use App\Actions\Attendance\MarkTodayAttendanceAction;
use App\Actions\Attendance\UnmarkTodayAttendanceAction;
use App\Actions\Attendance\UnmarkTodayResult;
use App\Http\Controllers\Controller;
use App\Http\Resources\AttendanceRecordResource;
use App\Http\Resources\AttendanceTodayPeerResource;
use App\Models\Academy;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;

/**
 * Athlete-portal attendance history (#618 / M7 PR-D slice 3).
 *
 * `GET /api/v1/me/attendance` — returns the authenticated athlete's
 * attendance records in the optional `[from, to]` date window.
 *
 * **404** when the caller has no linked `athletes` row:
 *
 * - Owner persona (no personal attendance — the existing
 *   `/athletes/{id}/attendance` is the right surface for any
 *   athlete's history).
 * - Orphan athlete-role user (rare — pre-invite-accept state).
 *
 * Both paths return the same `{"message":"No athlete profile found."}`
 * envelope so the SPA renders the "no profile" state without leaking
 * which branch triggered it.
 *
 * **422** when `from` or `to` is a malformed date string, or when
 * `from > to`. The envelope is `{"message":"Invalid date range."}`
 * — the SPA shows a toast and keeps the previous results.
 *
 * Reuses `GetAthleteAttendanceAction` (already built for the owner
 * surface) so the read semantics + ordering match across both
 * personas.
 */
class MyAttendanceController extends Controller
{
    public function __construct(
        private readonly GetAthleteAttendanceAction $action,
        private readonly MarkTodayAttendanceAction $markTodayAction,
        private readonly UnmarkTodayAttendanceAction $unmarkTodayAction,
        private readonly GetTodayPeersAction $peersAction,
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

        $fromRaw = $request->query('from');
        $toRaw = $request->query('to');

        if ($this->isInvalidDateInput($fromRaw) || $this->isInvalidDateInput($toRaw)) {
            return response()->json(['message' => 'Invalid date range.'], 422);
        }

        $from = $this->parseOptionalDate($fromRaw);
        $to = $this->parseOptionalDate($toRaw);

        if ($from !== null && $to !== null && $from->greaterThan($to)) {
            return response()->json(['message' => 'Invalid date range.'], 422);
        }

        $records = $this->action->execute($athlete, $from, $to);

        return AttendanceRecordResource::collection($records);
    }

    /**
     * `POST /api/v1/me/attendance/today` (#960) — self-register the
     * athlete's presence for today. Business logic (training-day rule
     * + idempotent fetch + delegation) lives in
     * `MarkTodayAttendanceAction`; this method maps the result branch
     * to the HTTP status only.
     *
     *  - `Created` → 201 with the new row
     *  - `Existed` → 200 with the existing row (instructor- OR self-marked)
     *  - `NotTrainingDay` → 422 with `{message}`
     *  - No athlete row → 404
     */
    public function markToday(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $athlete = $user->athlete;
        if ($athlete === null) {
            return response()->json(['message' => 'No athlete profile found.'], 404);
        }

        $result = $this->markTodayAction->execute($athlete);

        return match ($result->status) {
            'created' => AttendanceRecordResource::make($result->record)
                ->response()
                ->setStatusCode(Response::HTTP_CREATED),
            'existed' => AttendanceRecordResource::make($result->record)
                ->response()
                ->setStatusCode(Response::HTTP_OK),
            'not_training_day' => response()->json(
                ['message' => 'Not a training day today.'],
                422,
            ),
            default => response()->json(['message' => 'Unexpected mark-today result.'], 500),
        };
    }

    /**
     * `GET /api/v1/me/attendance/today/peers` (#958) — peers from the
     * caller's academy whose attendance row exists for today. Drives
     * the "Chi viene stasera?" preview row on the self-mark page.
     * Capped + opt-out-respected inside the Action.
     */
    public function peers(Request $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $athlete = $user->athlete;
        if ($athlete === null) {
            return response()->json(['message' => 'No athlete profile found.'], 404);
        }

        /** @var Academy $academy */
        $academy = $athlete->academy;

        return AttendanceTodayPeerResource::collection(
            $this->peersAction->execute($academy),
        );
    }

    /**
     * `DELETE /api/v1/me/attendance/today` (#960) — revert the
     * athlete's own self-mark. Idempotent: 204 on success AND when no
     * row exists. 403 when today's row was instructor-marked — only
     * the instructor can revert their own marks. Business logic lives
     * in `UnmarkTodayAttendanceAction`; the controller's job is the
     * 404-vs-result-enum → HTTP-status mapping.
     */
    public function unmarkToday(Request $request): JsonResponse|Response
    {
        /** @var User $user */
        $user = $request->user();

        $athlete = $user->athlete;
        if ($athlete === null) {
            return response()->json(['message' => 'No athlete profile found.'], 404);
        }

        return match ($this->unmarkTodayAction->execute($athlete)) {
            UnmarkTodayResult::Deleted, UnmarkTodayResult::NoRow => response()->noContent(),
            UnmarkTodayResult::InstructorLocked => response()->json(
                ['message' => 'Cannot revert an instructor-marked attendance.'],
                403,
            ),
        };
    }

    /**
     * `true` only when the raw input is *present* but cannot be parsed
     * as `YYYY-MM-DD`. Missing / null inputs are NOT invalid — they
     * fall through to the unbounded window. Non-null non-string inputs
     * (arrays from `?from[]=2026-01-01`, numeric coercions) ARE invalid
     * — the previous shape let them slip through as "no filter", which
     * masked client bugs (Copilot review on #636). Empty strings stay
     * "not invalid" to keep the unbounded-window default working when
     * the SPA sends `?from=` with no value.
     */
    private function isInvalidDateInput(mixed $raw): bool
    {
        if ($raw === null) {
            return false;
        }

        if (! \is_string($raw)) {
            return true;
        }

        if ($raw === '') {
            return false;
        }

        return $this->parseOptionalDate($raw) === null;
    }

    /**
     * Parse an optional `YYYY-MM-DD` query param. Returns null when
     * the input is missing, empty, or unparseable; the controller
     * pre-validates the "present-but-unparseable" case via
     * `isInvalidDateInput()` so by the time this is called on a
     * non-null input the value is known-good.
     */
    private function parseOptionalDate(mixed $raw): ?CarbonImmutable
    {
        if (! \is_string($raw) || $raw === '') {
            return null;
        }

        // Pre-validate the format with a regex before handing it to
        // Carbon — `createFromFormat('!Y-m-d', '2026-13-99')`
        // overflows silently into a valid-but-wrong date (2027-04-08)
        // instead of failing. The regex is the boundary check; Carbon
        // is then trusted to honor the real-calendar bounds of valid-
        // shape inputs.
        if (! preg_match('/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/', $raw)) {
            return null;
        }

        try {
            $parsed = CarbonImmutable::createFromFormat('!Y-m-d', $raw);
        } catch (\Throwable) {
            return null;
        }

        if ($parsed === null) {
            return null;
        }

        // Carbon still accepts e.g. `2026-02-30` and rolls it
        // forward; reject anything where the round-trip output
        // doesn't match the input.
        if ($parsed->format('Y-m-d') !== $raw) {
            return null;
        }

        return $parsed;
    }
}
