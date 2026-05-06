<?php

declare(strict_types=1);

namespace App\Http\Controllers\Athlete;

use App\Actions\Address\SyncAddressAction;
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
use Illuminate\Support\Facades\DB;

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

    public function __construct(
        private readonly SyncAddressAction $syncAddress,
    ) {
    }

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

        // Re-used twice: once as the eager-load scope (so the resource sees
        // only this month's slice), once as the filter scope below for
        // ?paid=yes|no. Pulling it into a closure means a future month
        // boundary tweak only happens in one place.
        $currentMonthScope = fn ($q) => $q
            ->where('year', $currentYear)
            ->where('month', $currentMonth);

        $paid = $request->input('paid');

        $query = $user->academy->athletes()
            // Eager-load only the current-month payments slice so the
            // `paid_current_month` derivation in AthleteResource doesn't fan
            // out into N+1 queries on a 20-row page (#104). One extra query
            // total — payments for all visible athletes in this month.
            ->with(['payments' => $currentMonthScope])
            // Eager-load the morph address (#72b) so AthleteResource's
            // `$athlete->address` access on each row is one batched query
            // instead of 20.
            ->with('address')
            ->when($request->filled('belt'), fn ($q) => $q->where('belt', $request->input('belt')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->input('status')))
            // ?paid=yes|no — filter on whether the athlete has a payment
            // record for the current calendar month (#105). Unrecognised
            // values are silently ignored (no filter applied) — same shape
            // as `sort_by`: defensive defaults beat 422-noise on a list
            // endpoint that's read by humans more than tools.
            ->when($paid === 'yes', fn ($q) => $q->whereHas('payments', $currentMonthScope))
            ->when($paid === 'no', fn ($q) => $q->whereDoesntHave('payments', $currentMonthScope))
            ->when($request->filled('q'), function (Builder|HasMany $q) use ($request) {
                // `$request->string('q')` returns a `Stringable` — keeps PHPStan
                // happy without the `mixed` → `string` cast that `input()` needs.
                $this->applyNameSearch($q, $request->string('q')->toString());
            });

        if ($sortBy === 'belt') {
            $this->applyBeltSort($query, $sortOrder);
        } elseif ($sortBy === 'first_name' || $sortBy === 'last_name') {
            // Name sort always tiebreaks on the OTHER name field in the same
            // direction (#196). The "Full name" column on the SPA is a
            // synthetic concatenation of two scalar columns; without a
            // tiebreak, two athletes sharing the primary key would land in
            // arbitrary order. The 4-state click cycle on the column header
            // picks which name leads (first / last) and the order
            // (asc / desc); the controller honors both consistently.
            $this->applyNameSort($query, $sortBy, $sortOrder);
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
        // No-academy and cross-academy 403s are owned by StoreAthleteRequest's
        // authorize() + failedAuthorization() override (single source of truth
        // for write 403s — see server/CLAUDE.md § Clean Architecture). The
        // FormRequest short-circuits before this method is invoked when the
        // user has no academy, so $user->academy is non-null below.
        \assert($user->academy !== null);

        $validated = $request->validated();
        // Address (#72b) lives on a polymorphic relation, not a column on
        // the athletes row — strip it from the mass-assignable payload
        // before `create()` and hand it to `SyncAddressAction` instead.
        /** @var array<string, mixed>|null $addressPayload */
        $addressPayload = isset($validated['address']) && \is_array($validated['address'])
            ? $validated['address']
            : null;
        unset($validated['address']);

        $athlete = DB::transaction(function () use ($user, $validated, $addressPayload): Athlete {
            $athlete = $user->academy->athletes()->create($validated);
            if ($addressPayload !== null) {
                $this->syncAddress->execute($athlete, $addressPayload);
            }

            return $athlete;
        });

        return response()->json(['data' => new AthleteResource($athlete)], 201);
    }

    public function show(Request $request, Athlete $athlete): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! $this->userOwns($user, $athlete)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        // Eager-load the single invitation row the SPA renders on the
        // athlete-detail card (#467) so AthleteResource doesn't issue a
        // lazy follow-up query. Returns null when there's no active
        // (pending or accepted) row — terminal history stays in
        // `invitations()` but isn't surfaced to the wire.
        $athlete->load('latestActiveInvitation');

        return response()->json(['data' => new AthleteResource($athlete)]);
    }

    public function update(UpdateAthleteRequest $request, Athlete $athlete): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if (! $this->userOwns($user, $athlete)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        $validated = $request->validated();
        // Three-way semantics on `address` (#72b): absent → no change,
        // null → clear (delete the morph row), array → upsert. Strip the
        // key off the scalar update payload either way; the dedicated
        // action carries it the rest of the way.
        $addressKeyPresent = \array_key_exists('address', $validated);
        $addressPayload = $validated['address'] ?? null;
        unset($validated['address']);

        $fresh = DB::transaction(function () use ($athlete, $validated, $addressKeyPresent, $addressPayload): Athlete {
            if ($validated !== []) {
                $athlete->update($validated);
            }
            if ($addressKeyPresent) {
                /** @var array<string, mixed>|null $payload */
                $payload = \is_array($addressPayload) ? $addressPayload : null;
                $this->syncAddress->execute($athlete, $payload);
            }

            return $athlete->fresh() ?? $athlete;
        });

        return response()->json(['data' => new AthleteResource($fresh)]);
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
        // `ELSE 99` traps any belt value that fell outside the enum (the
        // column is plain varchar with no CHECK constraint, so a direct
        // DB write or a future enum-removal migration could leave a
        // stray row). Without an explicit ELSE the CASE returns NULL —
        // and NULL sorts first on ASC, hiding the data drift exactly
        // when we'd want it surfaced. 99 is far above the real ranks
        // (1-9), so unknown values land at the end on ASC and at the
        // top on DESC; either way they're visible, not buried.
        $caseAsc = "CASE belt WHEN 'grey' THEN 1 WHEN 'yellow' THEN 2 WHEN 'orange' THEN 3 WHEN 'green' THEN 4 WHEN 'white' THEN 5 WHEN 'blue' THEN 6 WHEN 'purple' THEN 7 WHEN 'brown' THEN 8 WHEN 'black' THEN 9 WHEN 'red-and-black' THEN 10 WHEN 'red-and-white' THEN 11 WHEN 'red' THEN 12 ELSE 99 END ASC";
        $caseDesc = "CASE belt WHEN 'grey' THEN 1 WHEN 'yellow' THEN 2 WHEN 'orange' THEN 3 WHEN 'green' THEN 4 WHEN 'white' THEN 5 WHEN 'blue' THEN 6 WHEN 'purple' THEN 7 WHEN 'brown' THEN 8 WHEN 'black' THEN 9 WHEN 'red-and-black' THEN 10 WHEN 'red-and-white' THEN 11 WHEN 'red' THEN 12 ELSE 99 END DESC";

        $query->orderByRaw($direction === 'asc' ? $caseAsc : $caseDesc);
        $query->orderBy('stripes', 'desc');
        $query->orderBy('last_name', 'asc');
    }

    /**
     * Multi-column name sort (#196). The "Full name" column on the SPA is
     * a synthetic field — `{first_name} {last_name}` — and the 4-state
     * click cycle (first asc/desc, last asc/desc) maps to:
     *
     *   sort_by=first_name → ORDER BY first_name [dir], last_name [dir]
     *   sort_by=last_name  → ORDER BY last_name  [dir], first_name [dir]
     *
     * Tiebreak direction matches the primary direction so that two
     * athletes sharing the primary name fall into a stable, intuitive
     * order ("Mario Bianchi" before "Mario Rossi" on asc; "Mario Rossi"
     * before "Mario Bianchi" on desc). Without the tiebreak SQLite
     * returns arbitrary order on ties — the test suite would be flaky on
     * any list with a name collision.
     *
     * @param  Builder<Athlete>|HasMany<Athlete, Academy>  $query
     */
    private function applyNameSort(Builder|HasMany $query, string $primary, string $direction): void
    {
        $secondary = $primary === 'first_name' ? 'last_name' : 'first_name';
        $query->orderBy($primary, $direction);
        $query->orderBy($secondary, $direction);
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
