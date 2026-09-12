import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  Observable,
  map,
  tap,
  catchError,
  throwError,
  of,
  shareReplay,
  finalize,
  switchMap,
} from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * ISO 3166-1 alpha-2 country code (#72). MVP supports only Italy; adding a
 * country here is a code change without a schema change.
 */
export type CountryCode = 'IT';

/**
 * What one carnet entry pays for (#1576): one class, or the whole day
 * however many classes were trained. Mirrors `App\Enums\CarnetEntryUnit`.
 */
export type CarnetEntryUnit = 'lesson' | 'day';

/**
 * ISO 3166-2:IT province codes (#72) — the standard two-letter Italian
 * car-plate / postal codes. Required when `country === 'IT'`.
 */
export type ItalianProvinceCode =
  | 'AG'
  | 'AL'
  | 'AN'
  | 'AO'
  | 'AP'
  | 'AQ'
  | 'AR'
  | 'AT'
  | 'AV'
  | 'BA'
  | 'BG'
  | 'BI'
  | 'BL'
  | 'BN'
  | 'BO'
  | 'BR'
  | 'BS'
  | 'BT'
  | 'BZ'
  | 'CA'
  | 'CB'
  | 'CE'
  | 'CH'
  | 'CL'
  | 'CN'
  | 'CO'
  | 'CR'
  | 'CS'
  | 'CT'
  | 'CZ'
  | 'EN'
  | 'FC'
  | 'FE'
  | 'FG'
  | 'FI'
  | 'FM'
  | 'FR'
  | 'GE'
  | 'GO'
  | 'GR'
  | 'IM'
  | 'IS'
  | 'KR'
  | 'LC'
  | 'LE'
  | 'LI'
  | 'LO'
  | 'LT'
  | 'LU'
  | 'MB'
  | 'MC'
  | 'ME'
  | 'MI'
  | 'MN'
  | 'MO'
  | 'MS'
  | 'MT'
  | 'NA'
  | 'NO'
  | 'NU'
  | 'OR'
  | 'PA'
  | 'PC'
  | 'PD'
  | 'PE'
  | 'PG'
  | 'PI'
  | 'PN'
  | 'PO'
  | 'PR'
  | 'PT'
  | 'PU'
  | 'PV'
  | 'PZ'
  | 'RA'
  | 'RC'
  | 'RE'
  | 'RG'
  | 'RI'
  | 'RM'
  | 'RN'
  | 'RO'
  | 'SA'
  | 'SI'
  | 'SO'
  | 'SP'
  | 'SR'
  | 'SS'
  | 'SU'
  | 'SV'
  | 'TA'
  | 'TE'
  | 'TN'
  | 'TO'
  | 'TP'
  | 'TR'
  | 'TS'
  | 'TV'
  | 'UD'
  | 'VA'
  | 'VB'
  | 'VC'
  | 'VE'
  | 'VI'
  | 'VR'
  | 'VT'
  | 'VV';

/**
 * Wire shape of an academy address (#72). Mirrors `AddressResource` on the
 * backend.
 *
 * **Asymmetric nullability.** The API CONTRACT on writes requires every
 * field except `line2` to be filled — `UpdateAcademyRequest::rules()` and
 * the SPA's all-or-nothing form validator both reject half-filled payloads.
 * But on reads, legacy rows backfilled from the pre-#72 freeform column
 * have only `line1` populated until the user re-edits, so we type the
 * fields as `string | null`. Consumers should handle null on render and
 * surface "fill in your address" copy when the row is incomplete.
 *
 * The same shape is used for the request body — empty/null on a write is
 * still rejected by validation, so the type is unsafe at the boundary on
 * purpose: making it `string` for writes would require a separate
 * `AddressInput` type, which adds friction without catching the error any
 * earlier than the form's validator does.
 */
export interface Address {
  line1: string | null;
  line2: string | null;
  city: string | null;
  postal_code: string | null;
  province: ItalianProvinceCode | null;
  country: CountryCode;
}

export interface Academy {
  id: number;
  name: string;
  slug: string;
  /**
   * Phone (#161) — same shape as Athlete. `phone_country_code` carries the
   * E.164 prefix (e.g. `+39`); `phone_national_number` carries the digits
   * after. Either both null or both filled, enforced server-side.
   * Optional on this interface for fixture-compat (#104 / #105 pattern).
   */
  phone_country_code?: string | null;
  phone_national_number?: string | null;
  /**
   * Contact links (#162) — three independently nullable URLs. Optional on
   * this interface for fixture-compat (same reason as the phone pair);
   * the wire shape always includes them from #162 onward.
   */
  website?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  /**
   * Structured address (#72). `null` means the academy has no address on
   * file (legitimate state — every owner can clear it). Keep this as a
   * required key (not optional) so a tooling miss surfaces at compile time.
   */
  address: Address | null;
  logo_url: string | null;
  /**
   * Academy-wide membership fee in cents. `null` means "not configured" —
   * the payments endpoints reject `POST` until set. Marked optional on
   * this interface (rather than `number | null` required) to keep older
   * test fixtures and Cypress mocks compiling without per-file updates;
   * the wire shape ALWAYS includes the field from #104 onward.
   */
  monthly_fee_cents?: number | null;
  /**
   * How many monthly price tiers the academy has configured (#1381). Zero on
   * an academy that charges one flat fee, which is every academy until the
   * owner adds a tier. Read it through `academyChargesAFee()` rather than
   * directly — the question worth asking is whether the academy manages
   * payments at all, and neither column answers that alone. Optional for the
   * same fixture-compat reason as the fee above.
   */
  fee_tier_count?: number;
  /**
   * Entry-carnet offering (#1364): price of one carnet in cents, and how
   * many entries it holds. `null` on either means "this academy doesn't sell
   * carnets" — selling is rejected until both are set, and the carnet UI
   * hides entirely. Optional on the interface for the same fixture-compat
   * reason as the fee above.
   */
  carnet_price_cents?: number | null;
  carnet_entries?: number | null;
  /**
   * What one carnet entry pays for (#1576): a lesson, or the whole training
   * day however many classes were trained. Never null on the wire — `lesson`
   * until the owner says otherwise; optional here for fixture compat only.
   */
  carnet_entry_unit?: CarnetEntryUnit;
  /**
   * Weekdays the academy trains on, as Carbon `dayOfWeek` ints (0=Sun..6=Sat).
   * `null` = "schedule not configured" — daily check-in falls back to
   * all-weekdays. Optional for the same fixture-compat reason as the fee.
   *
   * From #1094 this is a **denormalised cache of the current schedule** —
   * source of truth for historical reads is `schedules` below.
   */
  training_days?: number[] | null;
  /**
   * Schedule in effect today (#1094). Same `training_days` as the
   * top-level field; carries `id` + `effective_from` so the UI can show
   * "in effect since". Optional for fixture-compat.
   */
  current_schedule?: AcademySchedule | null;
  /**
   * Pending future schedule change, or `null` when none is scheduled
   * (#1094). At most one row exists at a time (single-pending-change
   * invariant from the PRD). Optional for fixture-compat.
   */
  next_schedule?: AcademySchedule | null;
  /**
   * Full schedule history (#1094), ordered most-recent `effective_from`
   * first. Consumed by `countScheduledTrainingDays` to compute correct
   * per-day denominators across mid-period schedule transitions.
   * Optional for fixture-compat.
   */
  schedules?: AcademySchedule[];
  /**
   * The training year (#1484), in three parts because three places need
   * different halves of it.
   *
   * `season_start_month` is the setting itself — 1-12, or `null` when nobody
   * has chosen and the server's September default applies. The settings form
   * is the only consumer.
   *
   * `season_start` and `season_label` are the server's answer for *today*:
   * the ISO date the current season began, and the name a person reads for
   * it (`2025/26`). Both are derived, so the SPA never re-implements the
   * boundary — "is March in this season or last?" has exactly one
   * definition, and it is `App\Support\Season`.
   *
   * All optional for the same fixture-compat reason as the fee above.
   */
  season_start_month?: number | null;
  /** ISO `YYYY-MM-DD`. */
  season_start?: string;
  season_label?: string;
  /**
   * How many classes are on the weekly timetable (#1562) — enough for the
   * academy page to say "4 classes a week" or "not set up yet" without a
   * second request. Optional for fixture-compat; absent reads as zero.
   */
  classes_count?: number;
}

/**
 * One row in the academy schedule history (#1094). Effective from the
 * given calendar date forward until the next row's `effective_from`.
 */
export interface AcademySchedule {
  readonly id: number;
  /** Carbon dayOfWeek ints (0=Sun..6=Sat); `null` = "not configured" for this period. */
  readonly training_days: number[] | null;
  /** ISO `YYYY-MM-DD` calendar date — no time component. */
  readonly effective_from: string;
}

/**
 * Payload for `POST /api/v1/academy/schedules` (#1094 PR 2). Schedules
 * a future `training_days` change. `effective_from` must be strictly
 * after today — same-day changes go through `PATCH /api/v1/academy`.
 */
export interface ScheduleChangePayload {
  training_days: number[] | null;
  /** `YYYY-MM-DD`, must be > today. */
  effective_from: string;
}

/**
 * Wire shape for `GET /api/v1/me/academy` (#618, M7 PR-D slice 2).
 * Same shape as `Academy` (omitting owner-private fields like
 * `monthly_fee_cents`) plus an `owner` block with the academy's
 * owner public contact info so athletes know whom to reach out to.
 */
export interface MeAcademyOwner {
  readonly first_name: string;
  readonly last_name: string;
  readonly email: string;
}

export interface MeAcademy {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
  readonly phone_country_code: string | null;
  readonly phone_national_number: string | null;
  readonly website: string | null;
  readonly facebook: string | null;
  readonly instagram: string | null;
  readonly address: Address | null;
  readonly logo_url: string | null;
  readonly training_days: number[] | null;
  readonly owner: MeAcademyOwner | null;
  /**
   * What one carnet entry pays for (#1576) — the athlete's balance drops by
   * one after two check-ins under `day`, and the portal says so. Optional
   * for fixture compat only; never null on the wire.
   */
  readonly carnet_entry_unit?: CarnetEntryUnit;
}

export interface CreateAcademyPayload {
  name: string;
  address?: Address | null;
  training_days?: number[] | null;
}

/**
 * Partial update. Every key is optional; what you don't send, the server
 * leaves untouched. `address: null`, `monthly_fee_cents: null`, and
 * `training_days: null` are the explicit "clear it" signals (distinct
 * from omitting the key entirely). For `address`, sending an `Address`
 * object replaces the existing record in place (#72).
 */
export interface UpdateAcademyPayload {
  name?: string;
  /** Phone pair (#161). `null` on both clears the saved phone. */
  phone_country_code?: string | null;
  phone_national_number?: string | null;
  /** Contact links (#162). Each is independently nullable; `null` clears the field. */
  website?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  address?: Address | null;
  monthly_fee_cents?: number | null;
  carnet_price_cents?: number | null;
  carnet_entries?: number | null;
  /** Never null: there is no "not configured" for what an entry pays for (#1576). */
  carnet_entry_unit?: CarnetEntryUnit;
  training_days?: number[] | null;
  /** Month the training year restarts in, 1-12 (#1484). `null` = "not chosen". */
  season_start_month?: number | null;
}

interface AcademyResponse {
  data: Academy;
}

@Injectable({ providedIn: 'root' })
export class AcademyService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/academy`;

  readonly academy = signal<Academy | null>(null);

  /**
   * Tracks the HTTP request that is currently in flight, if any. We reuse it
   * when concurrent callers (e.g. `noAcademyGuard` immediately followed by
   * `hasAcademyGuard` on a redirect chain) hit `get()` in the same tick, so
   * only one round-trip goes out instead of two.
   */
  private inflight$: Observable<Academy> | null = null;

  /**
   * Monotonic request epoch. Bumped by `clear()` and by each new request
   * (incl. `forceRefresh`). Any in-flight request whose captured epoch no
   * longer matches the current value is considered stale: its `tap()` and
   * 404/401-handler are no-ops, so a late response from the previous
   * session can never repopulate the signal (logout correctness).
   */
  private epoch = 0;

  /**
   * Resolves the current academy. Reads from the cached `academy` signal
   * when possible — subsequent guard runs across `/dashboard/*` navigations
   * complete synchronously instead of blocking on a network round-trip.
   *
   * Call with `{ forceRefresh: true }` (or `clear()` first) when the server
   * state may have changed: after a mutation, on explicit reload, etc.
   */
  /**
   * Whether the cached payload's season has since ended (#1484).
   *
   * `season_start` and `season_label` are the server's answer for the day the
   * response was built, and this cache outlives that day — the desktop app is
   * left open for weeks at a time. Every other field on the payload goes
   * stale only when somebody edits it, which is why the cache never needed to
   * expire; these two go stale on their own, at midnight on the boundary.
   *
   * It matters because the roster divides one by the other: the attendance
   * count is recomputed server-side on every request, while the denominator
   * is derived from this payload. Across the rollover that renders a new
   * season's count over the old season's sessions — `0/300` — which is not a
   * rounding error, it is a different question answered on each line.
   *
   * The check costs one date comparison on the hot path and refetches once a
   * year, on the one day the answer actually changed.
   */
  private seasonHasEnded(academy: Academy): boolean {
    const iso = academy.season_start;
    if (!iso) return false;

    const [y, m, d] = iso.split('-').map(Number);
    // A season runs a year from its start, so it has ended once today has
    // reached the same date a year on.
    return new Date() >= new Date(y + 1, m - 1, d);
  }

  get(options: { forceRefresh?: boolean } = {}): Observable<Academy> {
    if (!options.forceRefresh) {
      const cached = this.academy();
      if (cached && !this.seasonHasEnded(cached)) {
        return of(cached);
      }
      if (this.inflight$) {
        return this.inflight$;
      }
    }

    const requestEpoch = ++this.epoch;
    const req$: Observable<Academy> = this.http.get<AcademyResponse>(this.base).pipe(
      tap((res) => {
        // Drop writes from stale epochs — logout / forceRefresh bumped the
        // epoch while this response was in flight, so the caller that started
        // it no longer represents the current session.
        if (requestEpoch === this.epoch) {
          this.academy.set(res.data);
        }
      }),
      map((res) => res.data),
      catchError((err: HttpErrorResponse) => {
        if (requestEpoch === this.epoch && (err.status === 404 || err.status === 401)) {
          this.academy.set(null);
        }
        return throwError(() => err);
      }),
      finalize(() => {
        // Only clear the pointer if this request is still the tracked one.
        // A concurrent `forceRefresh` or `clear()` may have already swapped
        // in a newer `inflight$`; we must not null that one out.
        if (this.inflight$ === req$) {
          this.inflight$ = null;
        }
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    this.inflight$ = req$;
    return req$;
  }

  create(payload: CreateAcademyPayload): Observable<Academy> {
    return this.http.post<AcademyResponse>(this.base, payload).pipe(
      tap((res) => this.academy.set(res.data)),
      map((res) => res.data),
    );
  }

  /**
   * Partial update of the authenticated user's academy. The server returns
   * the full fresh record, which we swap into the signal so every consumer
   * (sidebar brand label, detail page, etc.) sees the new value in the same
   * tick without a second network round-trip.
   *
   * Most errors propagate to the caller without touching the cache so the
   * form can retry or cancel without losing state. The single exception is
   * 403: the backend returns it on PATCH when the user no longer has an
   * academy (while GET returns 404 for the same underlying state). In that
   * case we clear() so downstream guard runs re-fetch, get 404, and
   * redirect the user to /setup instead of sitting on a stale cached
   * academy they can no longer touch.
   *
   * The epoch bump at entry mirrors the invariant `clear()` already relies
   * on: any `get()` request still in flight when we started must not be
   * able to overwrite the signal with its pre-update snapshot when it
   * eventually lands. Without this, a slow in-flight `get()` that returns
   * AFTER the PATCH response would silently clobber the fresh update.
   */
  update(payload: UpdateAcademyPayload): Observable<Academy> {
    return this.mutate(this.http.patch<AcademyResponse>(this.base, payload)).pipe(
      catchError((err: HttpErrorResponse) => {
        if (err.status === 403) {
          this.clear();
        }
        return throwError(() => err);
      }),
    );
  }

  /**
   * Schedules a future `training_days` change (#1094). The endpoint
   * rejects same-day and past dates — those go through `update()`.
   * Refreshes the academy on success so the cached `next_schedule`
   * pointer flips on the SPA without an extra round-trip.
   */
  scheduleChange(payload: ScheduleChangePayload): Observable<Academy> {
    return this.http
      .post(`${this.base}/schedules`, payload)
      .pipe(switchMap(() => this.get({ forceRefresh: true })));
  }

  /**
   * Cancels a pending future schedule change (#1094). 204 on success;
   * 422 if the caller targets a past-or-today row (immutable). Refreshes
   * the academy so the `next_schedule` pointer clears without a manual
   * `get()`.
   */
  cancelPendingSchedule(scheduleId: number): Observable<Academy> {
    return this.http
      .delete(`${this.base}/schedules/${scheduleId}`)
      .pipe(switchMap(() => this.get({ forceRefresh: true })));
  }

  uploadLogo(file: File): Observable<Academy> {
    const form = new FormData();
    form.append('logo', file);
    return this.mutate(this.http.post<AcademyResponse>(`${this.base}/logo`, form));
  }

  removeLogo(): Observable<Academy> {
    return this.mutate(this.http.delete<AcademyResponse>(`${this.base}/logo`));
  }

  /**
   * Read the academy the authenticated user belongs to (#618, M7 PR-D
   * slice 2). Role-agnostic — owners get their owned academy, athletes
   * get the one on their linked athlete row. Returns `null` on 404 so
   * the caller can render the empty state without subscribing to an
   * error path.
   *
   * Not cached — this surface is rarely revisited within a session
   * and the cache invalidation rules would complicate the
   * (single-purpose, athlete-side) view. The owner-side `get()`
   * cache stays in charge of the higher-traffic `/api/v1/academy`.
   */
  getMine(): Observable<MeAcademy | null> {
    return this.http.get<{ data: MeAcademy }>(`${environment.apiBase}/api/v1/me/academy`).pipe(
      map((res) => res.data),
      catchError((err: HttpErrorResponse) =>
        err.status === 404 ? of<MeAcademy | null>(null) : throwError(() => err),
      ),
    );
  }

  /**
   * Invalidates the cached academy. Any in-flight `get()` started before the
   * call will complete silently — its `tap()` is gated on the pre-clear epoch
   * and will be skipped — so stale data from a previous session cannot
   * repopulate the signal (e.g. logout while `/api/v1/academy` was pending).
   */
  clear(): void {
    this.academy.set(null);
    this.inflight$ = null;
    this.epoch++;
  }

  /**
   * Shared write-path: bumps the epoch (so any in-flight `get()` started
   * before the mutation is dropped on arrival), abandons the cached
   * inflight pointer, swaps the signal to the server's fresh record, and
   * unwraps the envelope for the caller. Used by `update`, `uploadLogo`
   * and `removeLogo` — same guarantees, one place.
   */
  private mutate(req$: Observable<AcademyResponse>): Observable<Academy> {
    this.epoch++;
    this.inflight$ = null;

    return req$.pipe(
      tap((res) => this.academy.set(res.data)),
      map((res) => res.data),
    );
  }
}
