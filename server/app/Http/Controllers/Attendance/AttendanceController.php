<?php

declare(strict_types=1);

namespace App\Http\Controllers\Attendance;

use App\Actions\Athlete\LoadAthleteIdentitiesAction;
use App\Actions\Attendance\DeleteAttendanceAction;
use App\Actions\Attendance\GetAthleteAttendanceAction;
use App\Actions\Attendance\GetAthleteAttendanceSummaryAction;
use App\Actions\Attendance\GetClassRegularsAction;
use App\Actions\Attendance\GetDailyAttendanceAction;
use App\Actions\Attendance\GetMonthlyAttendanceSummaryAction;
use App\Actions\Attendance\MarkAttendanceAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Attendance\AthleteAttendanceSummaryRequest;
use App\Http\Requests\Attendance\ClassRegularsRequest;
use App\Http\Requests\Attendance\MarkAttendanceRequest;
use App\Http\Requests\Attendance\MonthlySummaryRequest;
use App\Http\Resources\AthleteIdentityResource;
use App\Http\Resources\AttendanceRecordResource;
use App\Http\Resources\ClassRegularResource;
use App\Models\Academy;
use App\Models\AcademyClass;
use App\Models\Athlete;
use App\Models\AttendanceRecord;
use App\Models\User;
use App\Support\AttendanceSummaryCache;
use App\Support\OperatorDay;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Cache;

class AttendanceController extends Controller
{
    public function __construct(
        private readonly MarkAttendanceAction $markAction,
        private readonly DeleteAttendanceAction $deleteAction,
        private readonly GetDailyAttendanceAction $dailyAction,
        private readonly GetAthleteAttendanceAction $athleteAction,
        private readonly GetMonthlyAttendanceSummaryAction $summaryAction,
        private readonly GetAthleteAttendanceSummaryAction $athleteSummaryAction,
        private readonly LoadAthleteIdentitiesAction $identities,
        private readonly GetClassRegularsAction $regularsAction,
    ) {
    }

    public function index(Request $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $academy = $user->activeAcademy();
        if ($academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $dateInput = (string) $request->query('date', OperatorDay::today()->toDateString());

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

        $academyClass = $this->classFor($academy, $request->query('academy_class_id'));
        if ($academyClass instanceof JsonResponse) {
            return $academyClass;
        }

        $records = $this->dailyAction->execute(
            academy: $academy,
            date: $date,
            includeTrashed: $request->boolean('trashed'),
            academyClass: $academyClass,
        );

        return AttendanceRecordResource::collection($records);
    }

    public function store(MarkAttendanceRequest $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->activeAcademy();

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

        // Same guard as the athletes above: the FormRequest checked the class
        // exists, this checks it is ours.
        $academyClass = $this->classFor($academy, $request->input('academy_class_id'));
        if ($academyClass instanceof JsonResponse) {
            return $academyClass;
        }

        $records = $this->markAction->execute(
            academy: $academy,
            date: $date,
            athleteIds: $athleteIds,
            academyClass: $academyClass,
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

        if ($user->activeAcademyId() === null || $athlete->academy_id !== $user->activeAcademyId()) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $from = $this->parseOptionalDate($request, 'from');
        $to = $this->parseOptionalDate($request, 'to');

        $records = $this->athleteAction->execute($athlete, $from, $to);

        return AttendanceRecordResource::collection($records);
    }

    /**
     * Per-athlete attendance summary over the last N days (#893) or a
     * calendar month (#1769). Cached for 5 min per athlete and window, under
     * a version per academy (`AttendanceSummaryCache`) that a closure, a
     * schedule row, a presence or a corrected joining date bumps, so a change
     * to either number is read at once.
     */
    public function athleteSummary(AthleteAttendanceSummaryRequest $request, Athlete $athlete): JsonResponse
    {
        // Authorization (caller owns this athlete) is enforced by the
        // FormRequest's authorize() — Laravel returns 403 before we get
        // here on a foreign-academy athlete.
        // A calendar month for the attendance tab's ring, or the last N days
        // for its card (#1769): one question, two windows.
        $month = $request->month();
        $today = OperatorDay::today();
        [$window, $from, $to] = $month !== null
            ? ['month.' . $month->format('Y-m'), $month, $month->endOfMonth()]
            : ['range.' . $request->rangeDays(), $today->subDays($request->rangeDays() - 1), $today];

        $payload = Cache::remember(
            AttendanceSummaryCache::key($athlete, $window),
            AttendanceSummaryCache::TTL_SECONDS,
            fn (): array => $this->athleteSummaryAction->execute($athlete, $from, $to),
        );

        return response()->json(['data' => $payload]);
    }

    public function summary(MonthlySummaryRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->activeAcademy();

        // Same invariant reasoning as store(): authorize() gates this, but
        // PHPStan doesn't track it across FormRequest boundaries.
        if ($academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $monthInput = $request->string('month')->toString();
        // `!` zeroes the unparsed fields: without it the day comes from today,
        // and on the 31st "2026-02" is 31 February, which is March.
        $month = CarbonImmutable::createFromFormat('!Y-m', $monthInput);
        if (! $month instanceof CarbonImmutable) {
            // Shouldn't reach here — the FormRequest's regex rule catches
            // malformed input first. Defensive fallback kept so a future
            // rule relaxation can't produce a 500.
            return response()->json(['message' => 'Invalid month.'], 422);
        }

        ['rows' => $rows, 'meta' => $meta] = $this->summaryAction->execute($academy, $month);

        // Each row also carries the person's identity (#1851), so the page
        // draws it with the belt like every other list of people. Additive:
        // the flat name fields stay.
        $athletes = $this->identities->execute($academy, $rows->map(fn (array $row): int => $row['athlete_id']));
        $data = $rows->map(function (array $row) use ($athletes, $request): array {
            $athlete = $athletes->get($row['athlete_id']);

            return [
                ...$row,
                'athlete' => $athlete === null ? null : new AthleteIdentityResource($athlete)->toArray($request),
            ];
        });

        return response()->json(['data' => $data, 'meta' => $meta]);
    }

    /**
     * Who usually comes to this class (#1730). All of them, not only the ones
     * missing: the check-in already knows who is on the mat, and subtracting
     * locally is what lets a tick take someone off the list without a request.
     */
    public function regulars(ClassRegularsRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->activeAcademy();

        // Same invariant reasoning as store(): authorize() gates this.
        if ($academy === null) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        // The rules make the class required, so `classFor` never answers null.
        $academyClass = $this->classFor($academy, $request->input('academy_class_id'));
        if (! $academyClass instanceof AcademyClass) {
            return $academyClass ?? response()->json(['message' => 'Forbidden.'], 403);
        }

        $result = $this->regularsAction->execute($academy, $academyClass, $request->day());

        return response()->json([
            'data' => ClassRegularResource::collection($result['regulars'])->resolve($request),
            'meta' => [
                'occurrences' => \count($result['occurrences']),
                'occurrence_dates' => $result['occurrences'],
            ],
        ]);
    }

    /**
     * An attendance record belongs to the authenticated user iff the
     * authenticated user owns an academy and the record's athlete belongs
     * to that academy. Mirrors DocumentController::userOwns().
     */
    private function userOwns(User $user, AttendanceRecord $record): bool
    {
        return $user->activeAcademyId() !== null
            && $record->athlete !== null
            && $record->athlete->academy_id === $user->activeAcademyId();
    }

    /**
     * The class a check-in is for (#1562), or null when none was asked for.
     *
     * A class that is not one of this academy's — another academy's, or no
     * one's at all — is one Forbidden, like an athlete from another academy.
     * The two cases must not be told apart, or the answer says which ids
     * exist somewhere; that is also why the FormRequest carries no `exists`
     * rule for it. Malformed input is the caller's mistake and says so.
     */
    private function classFor(Academy $academy, mixed $raw): AcademyClass|JsonResponse|null
    {
        if ($raw === null || $raw === '') {
            return null;
        }

        if (! is_numeric($raw)) {
            return response()->json(
                ['message' => 'Invalid class.', 'errors' => ['academy_class_id' => ['Invalid class.']]],
                422,
            );
        }

        $academyClass = AcademyClass::query()
            ->where('academy_id', $academy->id)
            ->find((int) $raw);

        return $academyClass ?? response()->json(['message' => 'Forbidden.'], 403);
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
