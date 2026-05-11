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
     * `true` only when the raw input is *present* but cannot be parsed
     * as `YYYY-MM-DD`. Missing / empty inputs are NOT invalid — they
     * fall through to the unbounded window. Copilot review on PR
     * #622: the previous shape silently swallowed parse errors and
     * treated `?from=garbage` as "no filter", which masked client
     * bugs.
     */
    private function isInvalidDateInput(mixed $raw): bool
    {
        if (! \is_string($raw) || $raw === '') {
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
