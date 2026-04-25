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
    /**
     * Map of `?sort_by=` values to the eloquent ORDER BY clause(s) we apply.
     * A string value is a single-column sort; a list of {column, direction}
     * triples drives a stable multi-key sort (used for `belt` so two black
     * belts stay grouped by stripes desc, then last_name asc).
     *
     * @var array<string, string|list<array{column: string, direction: string}>>
     */
    private const SORTABLE_COLUMNS = [
        'first_name' => 'first_name',
        'last_name' => 'last_name',
        'belt' => [
            ['column' => 'belt', 'direction' => 'preserve'],
            ['column' => 'stripes', 'direction' => 'desc'],
            ['column' => 'last_name', 'direction' => 'asc'],
        ],
        'stripes' => 'stripes',
        'joined_at' => 'joined_at',
        'created_at' => 'created_at',
    ];

    public function index(Request $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->academy === null) {
            return response()->json(['message' => 'No academy found.'], 403);
        }

        $sortBy = \is_string($request->input('sort_by')) ? $request->input('sort_by') : null;
        $sortOrder = $request->input('sort_order') === 'asc' ? 'asc' : 'desc';

        $query = $user->academy->athletes()
            ->when($request->filled('belt'), fn ($q) => $q->where('belt', $request->input('belt')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')));

        if ($sortBy !== null && \array_key_exists($sortBy, self::SORTABLE_COLUMNS)) {
            $clause = self::SORTABLE_COLUMNS[$sortBy];
            if (\is_string($clause)) {
                $query->orderBy($clause, $sortOrder);
            } else {
                foreach ($clause as $step) {
                    $direction = $step['direction'] === 'preserve' ? $sortOrder : $step['direction'];
                    $query->orderBy($step['column'], $direction);
                }
            }
        } else {
            $query->latest();
        }

        $athletes = $query->paginate(20);

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

        if (! $this->userOwns($user, $athlete)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return response()->json(['data' => new AthleteResource($athlete)]);
    }

    public function update(UpdateAthleteRequest $request, Athlete $athlete): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! $this->userOwns($user, $athlete)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $athlete->update($request->validated());

        return response()->json(['data' => new AthleteResource($athlete->fresh())]);
    }

    public function destroy(Request $request, Athlete $athlete): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! $this->userOwns($user, $athlete)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $athlete->delete();

        return response()->json(null, 204);
    }

    /**
     * An athlete belongs to the authenticated user iff the user owns an academy
     * and the athlete's academy_id matches it. Mirrors the DocumentController::userOwns()
     * pattern for consistency.
     */
    private function userOwns(User $user, Athlete $athlete): bool
    {
        return $user->academy !== null
            && $athlete->academy_id === $user->academy->id;
    }
}
