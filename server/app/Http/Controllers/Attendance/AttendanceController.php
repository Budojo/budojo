<?php

declare(strict_types=1);

namespace App\Http\Controllers\Attendance;

use App\Actions\Attendance\DeleteAttendanceAction;
use App\Actions\Attendance\GetAthleteAttendanceAction;
use App\Actions\Attendance\GetDailyAttendanceAction;
use App\Actions\Attendance\GetMonthlyAttendanceSummaryAction;
use App\Actions\Attendance\MarkAttendanceAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\MarkAttendanceRequest;
use App\Http\Requests\Attendance\MonthlySummaryRequest;
use App\Http\Resources\AttendanceRecordResource;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AttendanceController extends Controller
{
    public function __construct(
        private readonly MarkAttendanceAction $markAction,
        private readonly DeleteAttendanceAction $deleteAction,
        private readonly GetDailyAttendanceAction $dailyAction,
        private readonly GetAthleteAttendanceAction $athleteAction,
        private readonly GetMonthlyAttendanceSummaryAction $summaryAction,
    ) {
    }

    public function index(Request $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $dateInput = (string) $request->query('date', now()->toDateString());

        // Strict parse: malformed `?date=` must 422, not silently fall
        // back to today. CarbonImmutable::createFromFormat returns
        // CarbonImmutable|false; checking instanceof covers the null
        // case too across Carbon versions (mirrors store() + summary()).
        $date = CarbonImmutable::createFromFormat('Y-m-d', $dateInput);
        if (! $date instanceof CarbonImmutable) {
            return response()->json(
                ['message' => 'Invalid date format. Use YYYY-MM-DD.', 'errors' => ['date' => ['Invalid date format.']]],
                422,
            );
        }

        $records = $this->dailyAction->execute(
            academy: $user->academy,
            date: $date,
            includeTrashed: $request->boolean('trashed'),
        );

        return AttendanceRecordResource::collection($records);
    }

    public function store(MarkAttendanceRequest $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->academy;

        // MarkAttendanceRequest::authorize() already guarantees this, but
        // PHPStan can't follow that invariant across a cross-class boundary.
        // Defensive re-check keeps the type tight and documents the contract.
        if ($academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        // Explicit (mixed) $v closure satisfies PHPStan's strict callable
        // signature check on array_map — intval / 'intval' as a string-name
        // callable has too-narrow a parameter type for the inferred input.
        // array_unique strips any duplicate ids the client sent (the
        // MarkAttendanceRequest `distinct` rule covers this at the request
        // layer too, but belt + braces: the ownership-count check below
        // relies on count(unique ids) === count(owned ids) — a stray
        // duplicate would under-count owned and false-403.
        $athleteIds = array_values(array_unique(array_map(
            static fn (mixed $v): int => is_numeric($v) ? (int) $v : 0,
            (array) $request->input('athlete_ids', []),
        )));

        // Cross-academy ownership guard: every submitted athlete MUST belong
        // to the caller's academy. The FormRequest validated shape (ids
        // exist in DB), but not ownership — that's this layer's job.
        $ownedCount = Athlete::whereIn('id', $athleteIds)
            ->where('academy_id', $academy->id)
            ->count();

        if ($ownedCount !== \count($athleteIds)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $dateInput = $request->string('date')->toString();
        $date = CarbonImmutable::createFromFormat('Y-m-d', $dateInput);
        // instanceof narrows past CarbonImmutable|false|null — different Carbon
        // versions return different failure sentinels; checking the type
        // covers every path.
        if (! $date instanceof CarbonImmutable) {
            return response()->json(['message' => 'Invalid date.'], 422);
        }

        $records = $this->markAction->execute(
            academy: $academy,
            date: $date,
            athleteIds: $athleteIds,
        );

        return AttendanceRecordResource::collection($records)
            ->response()
            ->setStatusCode(201);
    }

    public function destroy(Request $request, AttendanceRecord $attendance): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! $this->userOwns($user, $attendance)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $this->deleteAction->execute($attendance);

        return response()->json(null, 204);
    }

    public function athleteHistory(Request $request, Athlete $athlete): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->academy === null || $athlete->academy_id !== $user->academy->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $from = $this->parseOptionalDate($request, 'from');
        $to = $this->parseOptionalDate($request, 'to');

        $records = $this->athleteAction->execute($athlete, $from, $to);

        return AttendanceRecordResource::collection($records);
    }

    public function summary(MonthlySummaryRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->academy;

        // Same invariant reasoning as store(): authorize() gates this, but
        // PHPStan doesn't track it across FormRequest boundaries.
        if ($academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $monthInput = $request->string('month')->toString();
        $month = CarbonImmutable::createFromFormat('Y-m', $monthInput);
        if (! $month instanceof CarbonImmutable) {
            // Shouldn't reach here — the FormRequest's regex rule catches
            // malformed input first. Defensive fallback kept so a future
            // rule relaxation can't produce a 500.
            return response()->json(['message' => 'Invalid month.'], 422);
        }

        $rows = $this->summaryAction->execute($academy, $month);

        return response()->json(['data' => $rows]);
    }

    /**
     * An attendance record belongs to the authenticated user iff the
     * authenticated user owns an academy and the record's athlete belongs
     * to that academy. Mirrors DocumentController::userOwns().
     */
    private function userOwns(User $user, AttendanceRecord $record): bool
    {
        return $user->academy !== null
            && $record->athlete !== null
            && $record->athlete->academy_id === $user->academy->id;
    }

    private function parseOptionalDate(Request $request, string $key): ?CarbonImmutable
    {
        $value = $request->query($key);

        if (! \is_string($value) || $value === '') {
            return null;
        }

        $parsed = CarbonImmutable::createFromFormat('Y-m-d', $value);

        // CarbonImmutable::createFromFormat returns CarbonImmutable|false
        // (documented) — `|| $parsed` narrows correctly. Using the raw
        // comparison keeps PHPStan happy without resorting to `@var`.
        return $parsed instanceof CarbonImmutable ? $parsed : null;
    }
}
