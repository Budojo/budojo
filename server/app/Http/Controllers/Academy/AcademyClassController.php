<?php

declare(strict_types=1);

namespace App\Http\Controllers\Academy;

use App\Authorization\Capability;
use App\Http\Controllers\Controller;
use App\Http\Requests\AcademyClass\DestroyAcademyClassRequest;
use App\Http\Requests\AcademyClass\StoreAcademyClassRequest;
use App\Http\Requests\AcademyClass\UpdateAcademyClassRequest;
use App\Http\Resources\AcademyClassResource;
use App\Models\AcademyClass;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * The weekly timetable (#1562).
 *
 * No Action per verb, for the same reason the price list has none: a class is
 * a name, a day and a time, and there is no business rule in writing one
 * down. The rule worth an Action — what a class becomes on a given evening —
 * lives in `App\Actions\Lesson\MaterialiseLessonAction`, where the check-in
 * reaches it.
 */
class AcademyClassController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academyId = $user->activeAcademyId();

        if ($academyId === null || ! $user->canInAcademy($academyId, Capability::AcademySettingsRead)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return AcademyClassResource::collection(
            AcademyClass::query()
                ->where('academy_id', $academyId)
                ->orderBy('weekday')
                // A class with no clock time goes after the ones that have
                // one — "sometime on Monday" reads naturally at the end of
                // Monday, and NULL sorting differs between engines otherwise.
                ->orderByRaw('starts_at IS NULL')
                ->orderBy('starts_at')
                ->orderBy('name')
                ->get(),
        );
    }

    public function store(StoreAcademyClassRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $class = AcademyClass::create([
            'academy_id' => $user->activeAcademyId(),
            ...$request->validated(),
        ]);

        return response()->json(['data' => new AcademyClassResource($class)], 201);
    }

    public function update(UpdateAcademyClassRequest $request, AcademyClass $academyClass): JsonResponse
    {
        // Lessons already held keep the name and time they were held under —
        // they copied it at creation and never look back here.
        $academyClass->update($request->validated());

        return response()->json(['data' => new AcademyClassResource($academyClass)]);
    }

    public function destroy(DestroyAcademyClassRequest $request, AcademyClass $academyClass): JsonResponse
    {
        // The lessons it produced stay, with `academy_class_id` nulled and
        // their snapshot intact. Removing a slot from next week's timetable
        // must never remove the evenings people already trained.
        $academyClass->delete();

        return response()->json(null, 204);
    }
}
