<?php

declare(strict_types=1);

namespace App\Http\Controllers\Me;

use App\Actions\Attendance\GetAthleteAttendanceAction;
use App\Actions\Attendance\MarkAttendanceAction;
use App\Enums\AttendanceSource;
use App\Http\Controllers\Controller;
use App\Http\Resources\AttendanceRecordResource;
use App\Models\Academy;
use App\Models\AttendanceRecord;
use App\Models\User;
use Carbon\Carbon;
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
        private readonly MarkAttendanceAction $markAttendance,
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
     * athlete's presence for today. Idempotent: 201 on the first call,
     * 200 on subsequent same-day calls (returns the existing row,
     * which may carry `source='instructor'` if the instructor already
     * marked them — the self-mark is a no-op in that case, NOT a
     * source flip).
     *
     * - 404 when the caller has no linked athlete row
     * - 422 when today is not in the academy's `training_days`
     */
    public function markToday(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $athlete = $user->athlete;
        if ($athlete === null) {
            return response()->json(['message' => 'No athlete profile found.'], 404);
        }

        /** @var Academy $academy */
        $academy = $athlete->academy;
        if (! $this->isTrainingDayToday($academy)) {
            return response()->json(['message' => 'Not a training day today.'], 422);
        }

        $today = CarbonImmutable::today();
        $existing = AttendanceRecord::query()
            ->where('athlete_id', $athlete->id)
            ->whereDate('attended_on', $today->toDateString())
            ->first();

        if ($existing !== null) {
            return AttendanceRecordResource::make($existing)
                ->response()
                ->setStatusCode(Response::HTTP_OK);
        }

        $created = $this->markAttendance->execute(
            $academy,
            $today,
            [$athlete->id],
            AttendanceSource::Self,
        )->first();

        return AttendanceRecordResource::make($created)
            ->response()
            ->setStatusCode(Response::HTTP_CREATED);
    }

    /**
     * `DELETE /api/v1/me/attendance/today` (#960) — revert the
     * athlete's own self-mark. Idempotent: 204 on success AND when no
     * row exists. 403 when today's row was instructor-marked — only
     * the instructor can revert their own marks (athletes can't fake
     * a "no-show" to undo what the instructor saw).
     */
    public function unmarkToday(Request $request): JsonResponse|Response
    {
        /** @var User $user */
        $user = $request->user();

        $athlete = $user->athlete;
        if ($athlete === null) {
            return response()->json(['message' => 'No athlete profile found.'], 404);
        }

        $today = Carbon::today()->toDateString();
        $record = AttendanceRecord::query()
            ->where('athlete_id', $athlete->id)
            ->whereDate('attended_on', $today)
            ->first();

        if ($record === null) {
            return response()->noContent();
        }
        if ($record->source !== AttendanceSource::Self) {
            return response()->json(
                ['message' => 'Cannot revert an instructor-marked attendance.'],
                403,
            );
        }

        $record->delete();

        return response()->noContent();
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

    /**
     * Today's weekday is in the academy's configured `training_days`.
     * Null / empty `training_days` → no schedule configured → today
     * does not count as a training day (returns false). The owner has
     * to explicitly populate the schedule for self-mark to be legal.
     */
    private function isTrainingDayToday(Academy $academy): bool
    {
        /** @var list<int>|null $trainingDays */
        $trainingDays = $academy->training_days;
        if ($trainingDays === null || $trainingDays === []) {
            return false;
        }

        return \in_array((int) Carbon::today()->dayOfWeek, $trainingDays, true);
    }
}
