<?php

declare(strict_types=1);

namespace App\Http\Controllers\Athlete;

use App\Http\Controllers\Controller;
use App\Http\Requests\Athlete\StoreAthleteRequest;
use App\Http\Requests\Athlete\UpdateAthleteRequest;
use App\Http\Resources\AthleteResource;
use App\Models\Athlete;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AthleteController extends Controller
{
    public function index(Request $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->academy === null) {
            return response()->json(['message' => 'No academy found.'], 403);
        }

        $athletes = $user->academy->athletes()
            ->when($request->filled('belt'), fn ($q) => $q->where('belt', $request->input('belt')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->paginate(20);

        return AthleteResource::collection($athletes);
    }

    public function store(StoreAthleteRequest $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->academy === null) {
            return response()->json(['message' => 'No academy found.'], 403);
        }

        $athlete = $user->academy->athletes()->create($request->validated());

        return response()->json(['data' => new AthleteResource($athlete)], 201);
    }

    public function show(Request $request, Athlete $athlete): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->academy === null || $athlete->academy_id !== $user->academy->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return response()->json(['data' => new AthleteResource($athlete)]);
    }

    public function update(UpdateAthleteRequest $request, Athlete $athlete): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->academy === null || $athlete->academy_id !== $user->academy->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $athlete->update($request->validated());

        return response()->json(['data' => new AthleteResource($athlete->fresh())]);
    }

    public function destroy(Request $request, Athlete $athlete): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->academy === null || $athlete->academy_id !== $user->academy->id) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $athlete->delete();

        return response()->json(null, 204);
    }
}
