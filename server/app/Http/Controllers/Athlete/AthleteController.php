<?php

declare(strict_types=1);

namespace App\Http\Controllers\Athlete;

use App\Http\Controllers\Controller;
use App\Http\Requests\Athlete\StoreAthleteRequest;
use App\Http\Requests\Athlete\UpdateAthleteRequest;
use App\Http\Resources\AthleteResource;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

class AthleteController extends Controller
{
    /**
     * Single-column sort whitelist. The `belt` case is special and lives in
     * applyBeltSort() because it needs a rank-aware CASE expression rather
     * than the lexicographic `orderBy('belt', ...)` the string column would
     * give us (alphabetic desc puts white first, not black).
     *
     * `stripes` is intentionally NOT in this whitelist (#101): it's only
     * meaningful as a within-belt tiebreaker — a 4-stripe blue belt above
     * a 0-stripe black belt is never the right answer. The tiebreaker is
     * applied automatically inside applyBeltSort().
     *
     * @var array<string, string>
     */
    private const SORTABLE_COLUMNS = [
        'first_name' => 'first_name',
        'last_name' => 'last_name',
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

        $currentYear = (int) now()->year;
        $currentMonth = (int) now()->month;

        $query = $user->academy->athletes()
            // Eager-load only the current-month payments slice so the
            // `paid_current_month` derivation in AthleteResource doesn't fan
            // out into N+1 queries on a 20-row page (#104). One extra query
            // total — payments for all visible athletes in this month.
            ->with(['payments' => fn ($q) => $q
                ->where('year', $currentYear)
                ->where('month', $currentMonth)])
            ->when($request->filled('belt'), fn ($q) => $q->where('belt', $request->input('belt')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            ->when($request->filled('q'), function (Builder|HasMany $q) use ($request) {
                // `$request->string('q')` returns a `Stringable` — keeps PHPStan
                // happy without the `mixed` → `string` cast that `input()` needs.
                $this->applyNameSearch($q, $request->string('q')->toString());
            });

        if ($sortBy === 'belt') {
            $this->applyBeltSort($query, $sortOrder);
        } elseif ($sortBy !== null && \array_key_exists($sortBy, self::SORTABLE_COLUMNS)) {
            $query->orderBy(self::SORTABLE_COLUMNS[$sortBy], $sortOrder);
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
     * Belt sort = rank-aware CASE expression for the primary key, then
     * stripes desc + last_name asc as stable tiebreakers so two athletes
     * at the same belt level always render in the same row order.
     *
     * The `WHEN ... THEN N` branches MUST stay in sync with `Belt::rank()`
     * — see `BeltRankSqlSyncTest`, which fails if the two ever drift. SQL
     * is hard-coded literal because PHPStan's `orderByRaw` signature
     * requires `literal-string` and constant-built strings don't qualify.
     *
     * @param  Builder<Athlete>|HasMany<Athlete, Academy>  $query
     */
    private function applyBeltSort(Builder|HasMany $query, string $direction): void
    {
        $caseAsc = "CASE belt WHEN 'white' THEN 1 WHEN 'blue' THEN 2 WHEN 'purple' THEN 3 WHEN 'brown' THEN 4 WHEN 'black' THEN 5 END ASC";
        $caseDesc = "CASE belt WHEN 'white' THEN 1 WHEN 'blue' THEN 2 WHEN 'purple' THEN 3 WHEN 'brown' THEN 4 WHEN 'black' THEN 5 END DESC";

        $query->orderByRaw($direction === 'asc' ? $caseAsc : $caseDesc);
        $query->orderBy('stripes', 'desc');
        $query->orderBy('last_name', 'asc');
    }

    /**
     * Token-AND search across first_name + last_name. The user's query is
     * split on whitespace; each token must match either column independently
     * (case-insensitive via the column collation — MySQL `utf8mb4_unicode_ci`
     * and SQLite ASCII LIKE both behave this way out of the box).
     *
     * Why token-AND instead of CONCAT-LIKE: the latter needs DB-specific SQL
     * (MySQL `CONCAT(...)` vs SQLite `||`), and PHPStan rejects the dynamic
     * `whereRaw` literal-string requirement. Token-AND uses only the standard
     * builder, stays portable, and naturally handles "Mario Ros" → matches
     * "Mario Rossi" (token 'Mario' hits first_name, token 'Ros' hits
     * last_name) without any concat trick.
     *
     * @param  Builder<Athlete>|HasMany<Athlete, Academy>  $query
     */
    private function applyNameSearch(Builder|HasMany $query, string $needle): void
    {
        $needle = trim($needle);
        if ($needle === '') {
            return;
        }

        $tokens = preg_split('/\s+/', $needle);
        if ($tokens === false) {
            return;
        }

        foreach ($tokens as $token) {
            if ($token === '') {
                continue;
            }
            $like = '%' . $token . '%';
            $query->where(function ($qb) use ($like): void {
                $qb->where('first_name', 'LIKE', $like)
                    ->orWhere('last_name', 'LIKE', $like);
            });
        }
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
