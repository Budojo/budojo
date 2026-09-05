<?php

declare(strict_types=1);

namespace App\Http\Controllers\Academy;

use App\Authorization\Capability;
use App\Http\Controllers\Controller;
use App\Http\Requests\FeeTier\DestroyFeeTierRequest;
use App\Http\Requests\FeeTier\StoreFeeTierRequest;
use App\Http\Requests\FeeTier\UpdateFeeTierRequest;
use App\Http\Resources\AcademyFeeTierResource;
use App\Models\AcademyFeeTier;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * The academy's monthly price list (#1381).
 *
 * There is no Action class per verb because there is no business rule to hold:
 * a tier is a label and two numbers. The one rule worth naming — which fee an
 * athlete actually pays — lives in `App\Support\MonthlyFee`, where both the
 * payment path and the athlete resource reach it.
 */
class FeeTierController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();
        $academyId = $user->activeAcademyId();

        if ($academyId === null || ! $user->canInAcademy($academyId, Capability::AcademySettingsRead)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return AcademyFeeTierResource::collection(
            AcademyFeeTier::query()
                ->where('academy_id', $academyId)
                ->withCount('athletes')
                ->orderBy('lessons_per_week')
                ->orderBy('id')
                ->get(),
        );
    }

    public function store(StoreFeeTierRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $tier = AcademyFeeTier::create([
            'academy_id' => $user->activeAcademyId(),
            ...$request->validated(),
        ]);

        return response()->json([
            'data' => new AcademyFeeTierResource($tier->loadCount('athletes')),
        ], 201);
    }

    public function update(UpdateFeeTierRequest $request, AcademyFeeTier $tier): JsonResponse
    {
        $tier->update($request->validated());

        return response()->json([
            'data' => new AcademyFeeTierResource($tier->loadCount('athletes')),
        ]);
    }

    public function destroy(DestroyFeeTierRequest $request, AcademyFeeTier $tier): JsonResponse
    {
        // Athletes on the tier are NOT deleted with it — the FK is
        // nullOnDelete, so they fall back to the academy's own fee. Removing a
        // price must never remove the people who were paying it.
        $tier->delete();

        return response()->json(null, 204);
    }
}
