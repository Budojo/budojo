<?php

declare(strict_types=1);

namespace App\Http\Controllers\Athlete;

use App\Actions\Address\AddressIntent;
use App\Actions\Athlete\CreateAthleteAction;
use App\Actions\Athlete\RestoreAthleteAction;
use App\Actions\Athlete\UpdateAthleteAction;
use App\Http\Controllers\Controller;
use App\Http\Requests\Athlete\StoreAthleteRequest;
use App\Http\Requests\Athlete\UpdateAthleteRequest;
use App\Http\Resources\AthleteResource;
use App\Models\Academy;
use App\Models\Athlete;
use App\Models\User;
use App\Support\MartialArt\MartialArtProfile;
use App\Support\MartialArt\RankLadder;
use App\Support\NameFold;
use App\Support\Season;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\DB;

class AthleteController extends Controller
{
    /**
     * The roster's belt sort (#1800). A literal on purpose: `orderByRaw()`
     * takes a `literal-string`, so the SQL cannot be generated from a ladder.
     * Instead it has `RankLadder::MAX_GRADES` placeholders and the academy's
     * ladder is **bound** into them (`RankLadder::sortBindings()`), padded
     * with nulls that never match. `BeltRankSqlShapeTest` keeps the count of
     * `WHEN ?` equal to MAX_GRADES.
     *
     * `ELSE 99` traps a belt value outside the ladder (the column is plain
     * varchar: a hand edit, a restore from another academy's backup). Without
     * it the CASE returns NULL, which sorts first on ASC and buries the drift;
     * 99 is above any rank, so such rows land last on ASC and first on DESC —
     * visible either way.
     */
    private const string BELT_RANK_ASC = 'CASE belt WHEN ? THEN 1 WHEN ? THEN 2 WHEN ? THEN 3 WHEN ? THEN 4 WHEN ? THEN 5 WHEN ? THEN 6 WHEN ? THEN 7 WHEN ? THEN 8 WHEN ? THEN 9 WHEN ? THEN 10 WHEN ? THEN 11 WHEN ? THEN 12 WHEN ? THEN 13 WHEN ? THEN 14 WHEN ? THEN 15 WHEN ? THEN 16 ELSE 99 END ASC';

    private const string BELT_RANK_DESC = 'CASE belt WHEN ? THEN 1 WHEN ? THEN 2 WHEN ? THEN 3 WHEN ? THEN 4 WHEN ? THEN 5 WHEN ? THEN 6 WHEN ? THEN 7 WHEN ? THEN 8 WHEN ? THEN 9 WHEN ? THEN 10 WHEN ? THEN 11 WHEN ? THEN 12 WHEN ? THEN 13 WHEN ? THEN 14 WHEN ? THEN 15 WHEN ? THEN 16 ELSE 99 END DESC';

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
        'joined_at' => 'joined_at',
        'created_at' => 'created_at',
    ];

    // `first_name` and `last_name` are deliberately NOT here. They are caught
    // two branches earlier by `applyNameSort()`, so these entries were dead
    // from the day #196 added that branch — and since #1527 they would be
    // worse than dead: they named the RAW columns, so anyone removing the
    // name branch would land on this fallback and silently restore ordering
    // by code point, with `da Silva` back below `Z` and no test failing (the
    // sort specs use ASCII names). Found in the v2.56.0 sweep.

    /**
     * Sortable AGGREGATES (#1447) — separate from the whitelist above because
     * these are not columns on `athletes`. They are the `withCount` /
     * `withMax` aliases the index selects, so they exist only inside this
     * query and can be ordered by name the same way a column can.
     *
     * @var array<string, string>
     */
    private const SORTABLE_AGGREGATES = [
        'attendance_month' => 'attendance_month_count',
        'attendance_total' => 'attendance_total_count',
        'last_seen' => 'last_attended_on',
    ];

    public function __construct(
        private readonly CreateAthleteAction $createAthlete,
        private readonly UpdateAthleteAction $updateAthlete,
        private readonly RestoreAthleteAction $restoreAthlete,
    ) {
    }

    public function index(Request $request): AnonymousResourceCollection|JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        if ($user->activeAcademyId() === null) {
            return response()->json(['message' => 'No academy found.'], 403);
        }

        $sortBy = \is_string($request->input('sort_by')) ? $request->input('sort_by') : null;
        $sortOrder = $request->input('sort_order') === 'asc' ? 'asc' : 'desc';

        $currentYear = (int) now()->year;
        $currentMonth = (int) now()->month;

        // The eager-load scope, so the resource sees only the payments that
        // could cover this month. The `?paid` filter below asks the same
        // `covering` rule through the `Athlete` scopes.
        //
        // "Covering", not "starting in" (#1382): a quarterly bought in
        // February pays for April, and asking for a row whose `month` is 4
        // would report that athlete unpaid all quarter.
        $currentMonthScope = fn ($q) => $q->covering($currentYear, $currentMonth);

        // The roster's attendance column (#1447). A plain date range, matching
        // GetMonthlyAttendanceSummaryAction, which asks this same question and
        // documents why the range is both exact and the faster shape: the
        // `date:Y-m-d` cast plus the DATE column keep the stored value
        // date-only on either engine, and leaving the column unwrapped keeps
        // the predicate sargable, so `(athlete_id, attended_on)` can range-scan
        // it. `whereYear` + `whereMonth` wrap the column in a function and give
        // that index up for nothing.
        $monthStart = CarbonImmutable::create($currentYear, $currentMonth, 1);
        \assert($monthStart !== null);
        $currentMonthAttendanceScope = fn ($q) => $q->whereBetween('attended_on', [
            $monthStart->toDateString(),
            $monthStart->endOfMonth()->toDateString(),
        ]);

        $paid = $request->input('paid');

        // `?status=trashed` (#700) is a special list mode: it surfaces
        // ONLY soft-deleted athletes (the restore picker UI). Detect it
        // upfront so the regular `->where('status', $value)` filter below
        // doesn't trigger — `trashed` is not a column value but a query-
        // scope toggle. Any other status value (active/injured/etc.) falls
        // through to the normal filter.
        $trashedMode = $request->input('status') === 'trashed';

        $academy = $user->activeAcademy();
        \assert($academy !== null); // guarded above

        // The season this moment falls in (#1484) — see App\Support\Season for
        // why the academy stores a recurring month rather than a date.
        $now = CarbonImmutable::now();
        $seasonAttendanceScope = fn ($q) => $q
            ->whereBetween('attended_on', [
                Season::startFor($academy, $now)->toDateString(),
                Season::endFor($academy, $now)->toDateString(),
            ])
            // The per-row floor: an athlete's own joining date, when it falls
            // inside the season. `athletes.joined_at` is reachable here
            // because this is a subquery correlated to the outer row.
            //
            // `DATE()` around it rather than a bare column comparison: the
            // column is a DATE but its cast carries no format, so Eloquent
            // writes `2026-09-01 00:00:00` while `attended_on` is normalised
            // to `2026-09-01` by its own `date:Y-m-d` cast. Compared as
            // strings the athlete's first day loses to itself, and someone
            // who trained on the day they joined was not counted for it.
            ->whereRaw('attended_on >= DATE(athletes.joined_at)');

        $query = $academy->athletes()
            ->when($trashedMode, fn ($q) => $q->onlyTrashed())
            // Eager-load only the current-month payments slice so the
            // `paid_current_month` derivation in AthleteResource doesn't fan
            // out into N+1 queries on a 20-row page (#104). One extra query
            // total — payments for all visible athletes in this month.
            ->with(['payments' => $currentMonthScope])
            // The price tier the resource reads for every row (#1381), and the
            // academy behind it — an athlete on no tier falls back to the
            // academy fee, so resolving the amount touches both. Two extra
            // queries for the page instead of two per athlete.
            ->with(['feeTier', 'academy'])
            // Same reasoning for the carnet chip (#1364): pre-load only the
            // carnets inside today's validity window, counted, so
            // `active_carnet` resolves in one extra query for the page
            // instead of two per row.
            ->with(['carnets' => static fn ($q) => $q->validOn(CarbonImmutable::today())])
            // Eager-load the morph address (#72b) so AthleteResource's
            // `$athlete->address` access on each row is one batched query
            // instead of 20.
            ->with('address')
            // Eager-load the linked user's handle + avatar columns —
            // AthleteResource exposes `user_handle` (gates the public-
            // profile affordance) AND `user_avatar_url` (drives the
            // avatar circle on every roster row, #983). The
            // `User::getAvatarUrlAttribute()` accessor reads
            // `avatar_path` + `updated_at` to compose the URL with a
            // cache-busting query param — omitting either column
            // silently returns null, so EVERY athlete on the roster
            // would fall back to initials regardless of whether the
            // linked user actually has an avatar uploaded.
            ->with(['user:id,handle,avatar_path,updated_at'])
            // Attendance, twice, as counts rather than rows (#1447): the
            // roster shows how often someone has turned up this month and in
            // total, and loading their sessions to count them would be a
            // second N+1 on the busiest screen in the app. Two subqueries for
            // the page.
            //
            // Days, not rows (#1765). One presence is one day: since the
            // timetable (#1562) an athlete in the gi class at 19:00 and the
            // no-gi one at 20:30 has two rows for that evening — coverage and
            // mat hours need to know both lessons — and the roster's fraction
            // divides by a count of days, so `count(*)` printed `2/1`.
            // `withCount` cannot say DISTINCT; a `select` in the constraint
            // replaces the counted column, so it does. The SoftDeletes global
            // scope still keeps a deleted row out of either count.
            // The season's count, not a lifetime one (#1484), and floored at
            // the athlete's own joining date because the lower bound differs
            // per ROW: someone who joined in November cannot have attended
            // the September sessions, and measuring them against the whole
            // season reports the academy's calendar as if it were their
            // record.
            ->withCount([
                'attendanceRecords as attendance_total_count' => fn ($q) => $seasonAttendanceScope($q)
                    ->select(DB::raw('count(distinct attended_on)')),
                'attendanceRecords as attendance_month_count' => fn ($q) => $currentMonthAttendanceScope($q)
                    ->select(DB::raw('count(distinct attended_on)')),
            ])
            // When they last trained (#1726) — the recency the two counts
            // cannot give: "7 this season" reads the same for someone who came
            // yesterday and someone who stopped in March. Not floored at the
            // season or at `joined_at`: a date either exists or it does not.
            // The SoftDeletes global scope keeps a corrected presence out.
            ->withMax('attendanceRecords as last_attended_on', 'attended_on')
            ->when($request->filled('belt'), fn ($q) => $q->where('belt', $request->input('belt')))
            ->when(
                ! $trashedMode && $request->filled('status'),
                fn ($q) => $q->where('status', $request->input('status')),
            )
            // ?paid=yes|no — the payment chip's own question, not whether a
            // payment row exists (#1722). `no` is the "Unpaid" chip: active,
            // charged a fee, not the owner, nothing covering the month. `yes`
            // is every other chip — a payment covering the month OR a carnet
            // spendable today; it used to leave carnet holders out, and an
            // owner asking who has paid means it the ordinary way. `yes` does
            // not gate on status (#805): an athlete who paid and then went
            // inactive has still paid. The scopes on `Athlete` hold the rule
            // for this filter, the owner digest and the overdue push alike.
            //
            // Unrecognised values are silently ignored (no filter applied) —
            // same shape as `sort_by`: defensive defaults beat 422-noise on a
            // list endpoint that's read by humans more than tools.
            ->when($paid === 'yes', fn ($q) => $q->coveredFor($currentYear, $currentMonth, $now))
            ->when($paid === 'no', fn ($q) => $q->owing($currentYear, $currentMonth, $now))
            ->when($request->filled('q'), function (Builder|HasMany $q) use ($request) {
                // `$request->string('q')` returns a `Stringable` — keeps PHPStan
                // happy without the `mixed` → `string` cast that `input()` needs.
                $this->applyNameSearch($q, $request->string('q')->toString());
            });

        if ($sortBy === 'belt') {
            $this->applyBeltSort($query, $sortOrder, MartialArtProfile::for($academy->martial_art)->ladder());
        } elseif ($sortBy === 'first_name' || $sortBy === 'last_name') {
            // Name sort always tiebreaks on the OTHER name field in the same
            // direction (#196). The "Full name" column on the SPA is a
            // synthetic concatenation of two scalar columns; without a
            // tiebreak, two athletes sharing the primary key would land in
            // arbitrary order. The 4-state click cycle on the column header
            // picks which name leads (first / last) and the order
            // (asc / desc); the controller honors both consistently.
            $this->applyNameSort($query, $sortBy, $sortOrder);
        } elseif ($sortBy !== null && \array_key_exists($sortBy, self::SORTABLE_AGGREGATES)) {
            // Names as the tiebreaker, always ascending (#1447). A count is a
            // small integer over a roster of hundreds, so ties are the common
            // case, not the edge one — half a class shares "0 this month".
            // Without a stable second key the tied block reorders itself
            // between pages and an athlete can appear on both page 1 and 2, or
            // on neither. Same reasoning as the name sort's own tiebreak
            // (#196).
            //
            // Nulls last in BOTH directions (#1726). Only `last_seen` can be
            // null — an athlete who has never trained — and they are neither
            // the most recent nor the most overdue: they are unknown. SQLite
            // puts NULL first on ASC, so the order says it explicitly. A
            // count is never null, so for the other two this key is inert.
            $alias = self::SORTABLE_AGGREGATES[$sortBy];
            $query->orderByRaw("{$alias} IS NULL")
                ->orderBy($alias, $sortOrder)
                ->orderBy('last_name_sort')
                ->orderBy('first_name_sort')
                ->orderBy('id');
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
        // user has no academy, so $user->activeAcademy() is non-null below.
        $academy = $user->activeAcademy();
        \assert($academy !== null);

        $validated = $request->validated();
        // Address (#72b) lives on a polymorphic relation, not a column
        // on the athletes row — strip it from the scalar payload and
        // carry the three-way intent via the value object, same shape
        // as `update()` below.
        $addressIntent = AddressIntent::fromValidated($validated);
        unset($validated['address']);

        $athlete = $this->createAthlete->execute($user, $academy, $validated, $addressIntent);

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
        // Plus both halves of the fee rule (#1381) — the resource resolves
        // what this athlete pays, and a lazy load would issue them one at a
        // time from inside the serializer.
        $athlete->load(['latestActiveInvitation', 'feeTier', 'academy']);
        // Unlike the two counts, the last presence is selected here too
        // (#1726): the athlete header shows it.
        $athlete->loadMax('attendanceRecords as last_attended_on', 'attended_on');

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
        // Three-way semantics on `address` (#72b) carried as a single
        // value object (Clean Code § "no flag arguments"). The
        // factory reads the validated payload and maps absent/null/
        // array to skip/clear/set — controller no longer juggles a
        // boolean + nullable payload.
        $addressIntent = AddressIntent::fromValidated($validated);
        unset($validated['address']);

        $fresh = $this->updateAthlete->execute(
            athlete: $athlete,
            validated: $validated,
            address: $addressIntent,
        );

        return response()->json(['data' => new AthleteResource($fresh)]);
    }

    public function destroy(Request $request, Athlete $athlete): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        // Capability gate: AthletesDelete is owner/admin only per
        // the matrix. Tenant scope is implicit — canInAcademy()
        // requires an active membership in the athlete's academy.
        if (! $user->canInAcademy($athlete->academy_id, \App\Authorization\Capability::AthletesDelete)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        // Owner-as-athlete rows (#748) cannot be removed through the
        // regular delete flow — doing so would leave the academy's
        // owner / staff member with attendance + promotion history
        // unreachable through the normal restore picker. The only
        // way to leave is `DELETE /api/v1/me/athlete` which soft-
        // deletes (history preserved if re-enrolled later) and is
        // explicitly the caller's own action.
        if ($athlete->is_self) {
            return response()->json(['message' => 'Self-enrolled athletes leave via DELETE /me/athlete.'], 403);
        }

        $athlete->delete();

        return response()->json(null, 204);
    }

    /**
     * Bring a soft-deleted athlete back into the active roster (#700).
     * The route's `->withTrashed()` binding resolves both trashed and
     * non-trashed ids; we 404 on the non-trashed branch so the action
     * stays idempotent semantically (no "already restored" toggle).
     * Ownership is the same gate as `destroy()` — owner of the
     * academy the athlete belongs to.
     */
    public function restore(Request $request, Athlete $athlete): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        // Capability gate: AthletesRestore is owner/admin only per
        // the matrix.
        if (! $user->canInAcademy($athlete->academy_id, \App\Authorization\Capability::AthletesRestore)) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        if (! $athlete->trashed()) {
            return response()->json(['message' => 'Athlete is not deleted.'], 404);
        }

        $fresh = $this->restoreAthlete->execute($athlete);

        return response()->json(['data' => new AthleteResource($fresh)]);
    }

    /**
     * Belt sort = the academy's ladder order for the primary key (#1800), then
     * stripes desc + last_name asc as stable tiebreakers so two athletes at
     * the same belt level always render in the same row order.
     *
     * @param  Builder<Athlete>|HasMany<Athlete, Academy>  $query
     * @param  'asc'|'desc'  $direction
     */
    private function applyBeltSort(Builder|HasMany $query, string $direction, RankLadder $ladder): void
    {
        $query->orderByRaw($direction === 'asc' ? self::BELT_RANK_ASC : self::BELT_RANK_DESC, $ladder->sortBindings());
        $query->orderBy('stripes', 'desc');
        $query->orderBy('last_name_sort', 'asc');
        $query->orderBy('id');
    }

    /**
     * Multi-column name sort (#196). The "Full name" column on the SPA is
     * a synthetic field — `{first_name} {last_name}` — and the 4-state
     * click cycle (first asc/desc, last asc/desc) maps to:
     *
     *   sort_by=first_name → ORDER BY first_name_sort [dir], last_name_sort [dir], id
     *   sort_by=last_name  → ORDER BY last_name_sort  [dir], first_name_sort [dir], id
     *
     * Both keys are the FOLDED columns (#1527) — lower-cased, diacritics
     * stripped — so `da Silva` sorts with the D's rather than after `Z`. The
     * `id` tail is what folding made necessary: `de Luca` and `De Luca` used to
     * be far apart and now tie.
     *
     * Tiebreak direction matches the primary direction so that two
     * athletes sharing the primary name fall into a stable, intuitive
     * order ("Mario Bianchi" before "Mario Rossi" on asc; "Mario Rossi"
     * before "Mario Bianchi" on desc). Without the tiebreak SQLite
     * returns arbitrary order on ties — the test suite would be flaky on
     * any list with a name collision.
     *
     * @param  Builder<Athlete>|HasMany<Athlete, Academy>  $query
     * @param  'first_name'|'last_name'  $primary
     * @param  'asc'|'desc'  $direction
     */
    private function applyNameSort(Builder|HasMany $query, string $primary, string $direction): void
    {
        $secondary = $primary === 'first_name' ? 'last_name' : 'first_name';
        $query->orderBy($primary . '_sort', $direction);
        $query->orderBy($secondary . '_sort', $direction);
        // Both keys are folded, so `de Luca` and `De Luca` now tie where they
        // used to be far apart (#1527). A tie with no further key reorders
        // between requests, which on a paginated list puts an athlete on two
        // pages or on neither. The id is arbitrary but stable, which is the
        // whole requirement.
        $query->orderBy('id');
    }

    /**
     * Token-AND search across the FOLDED name columns (#1527). The user's
     * query is split on whitespace; each token is folded the same way the
     * columns are and must match either of them independently.
     *
     * The folding is what makes it case- and accent-insensitive. `LIKE` alone
     * folds ASCII case only, so `angelo` could never reach `Ângelo` — and
     * neither could `Ângelo`, because nobody types the circumflex when they
     * are looking for someone. A letter outside `NameFold::MAP` is left as
     * written on both sides, so it stays findable by its exact spelling.
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
            // Both sides folded (#1527): the column by the database, the needle
            // here. LIKE is case-insensitive for ASCII only, so `angelo` could
            // never reach `Ângelo` — and neither could `Ângelo`, because the
            // owner rarely types the circumflex.
            $like = '%' . NameFold::fold($token) . '%';
            $query->where(function ($qb) use ($like): void {
                $qb->where('first_name_sort', 'LIKE', $like)
                    ->orWhere('last_name_sort', 'LIKE', $like);
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
        return $user->activeAcademyId() !== null
            && $athlete->academy_id === $user->activeAcademyId();
    }
}
