<?php

declare(strict_types=1);

namespace App\Http\Controllers\Academy;

use App\Authorization\Capability;
use App\Http\Controllers\Controller;
use App\Http\Requests\AcademyClosure\DestroyAcademyClosureRequest;
use App\Http\Requests\AcademyClosure\StoreAcademyClosureRequest;
use App\Http\Requests\AcademyClosure\UpdateAcademyClosureRequest;
use App\Http\Resources\AcademyClosureResource;
use App\Models\AcademyClosure;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * The days the academy is shut (#1766).
 *
 * No Action per verb, like the timetable: a closure is two dates and a name,
 * and there is no rule in writing one down. The rule — a closed day is not a
 * scheduled one — lives in `App\Support\ScheduledDays`, where every reader
 * of scheduled days reaches it.
 */
class AcademyClosureController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academyId = $user->activeAcademyId();

        if ($academyId === null || ! $user->canInAcademy($academyId, Capability::AcademySettingsRead)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return AcademyClosureResource::collection(
            AcademyClosure::query()
                ->where('academy_id', $academyId)
                ->orderBy('starts_on')
                ->orderBy('ends_on')
                ->get(),
        );
    }

    public function store(StoreAcademyClosureRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $closure = AcademyClosure::create([
            'academy_id' => $user->activeAcademyId(),
            ...$request->validated(),
        ]);

        return response()->json(['data' => new AcademyClosureResource($closure)], 201);
    }

    public function update(UpdateAcademyClosureRequest $request, AcademyClosure $closure): JsonResponse
    {
        $closure->update($request->validated());

        return response()->json(['data' => new AcademyClosureResource($closure)]);
    }

    public function destroy(DestroyAcademyClosureRequest $request, AcademyClosure $closure): JsonResponse
    {
        $closure->delete();

        return response()->json(null, 204);
    }
}
