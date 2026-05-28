<?php

declare(strict_types=1);

namespace App\Http\Controllers\Academy;

use App\Actions\Academy\ScheduleAcademyChangeAction;
use App\Exceptions\PendingScheduleAlreadyExistsException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Academy\StoreAcademyScheduleRequest;
use App\Http\Resources\AcademyScheduleResource;
use App\Models\AcademySchedule;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Schedule-history write endpoints (#1094 PR 2). Reads are folded into
 * the `GET /api/v1/academy` resource so the SPA gets the whole picture
 * (current_schedule + next_schedule + schedules) in one round-trip.
 */
class AcademyScheduleController extends Controller
{
    public function __construct(
        private readonly ScheduleAcademyChangeAction $scheduleAction,
    ) {
    }

    public function store(StoreAcademyScheduleRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        /** @var \App\Models\Academy $academy */
        $academy = $user->activeAcademy();

        $validated = $request->validated();

        /** @var list<int>|null $trainingDays */
        $trainingDays = $this->trainingDaysFromValidated($validated);

        // FormRequest pins this to a `Y-m-d` string; the assertion +
        // explicit `parse()` call quiets PHPStan's mixed-narrowing
        // without changing the runtime behaviour (the validator
        // already guarantees the format).
        $effectiveFromRaw = $validated['effective_from'];
        \assert(\is_string($effectiveFromRaw));
        $effectiveFrom = Carbon::parse($effectiveFromRaw)->startOfDay();

        try {
            $schedule = $this->scheduleAction->execute(
                $academy,
                $trainingDays,
                $effectiveFrom,
            );
        } catch (PendingScheduleAlreadyExistsException $e) {
            // Match the FormRequest validation error shape so the FE
            // handles "already pending" identically to the per-field
            // 422s on bad payloads.
            return response()->json([
                'message' => $e->getMessage(),
                'errors' => ['effective_from' => [$e->getMessage()]],
            ], 422);
        }

        return response()->json(['data' => new AcademyScheduleResource($schedule)], 201);
    }

    /**
     * Cancel a pending future schedule. Past rows are immutable —
     * the API returns 422 if the caller targets one. Ownership is
     * enforced by asserting the row belongs to the caller's active
     * academy; mismatches collapse to 404 so we don't leak existence.
     */
    public function destroy(Request $request, AcademySchedule $schedule): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academy = $user->activeAcademy();

        if ($academy === null || $schedule->academy_id !== $academy->id) {
            return response()->json(['message' => 'Not found.'], 404);
        }

        if ($schedule->effective_from->lessThanOrEqualTo(Carbon::today())) {
            return response()->json([
                'message' => 'Past or today schedules are immutable.',
            ], 422);
        }

        $schedule->delete();

        return response()->json(null, 204);
    }

    /**
     * Pulls `training_days` out of the validated payload as a `list<int>|null`.
     * Mirror of `AcademyController::trainingDaysFromValidated()` — the
     * FormRequest enforces shape, this just narrows the static type
     * for the Action.
     *
     * @param  array<string, mixed>  $validated
     * @return list<int>|null
     */
    private function trainingDaysFromValidated(array $validated): ?array
    {
        if (! \array_key_exists('training_days', $validated)) {
            return null;
        }

        $value = $validated['training_days'];
        if ($value === null) {
            return null;
        }

        $list = [];
        foreach ((array) $value as $day) {
            if (\is_int($day)) {
                $list[] = $day;
            }
        }

        return $list;
    }
}
