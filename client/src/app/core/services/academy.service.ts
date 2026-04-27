import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, map, tap, catchError, throwError, of, shareReplay, finalize } from 'rxjs';

/**
 * ISO 3166-1 alpha-2 country code (#72). MVP supports only Italy; adding a
 * country here is a code change without a schema change.
 */
export type CountryCode = 'IT';

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
 * backend one-for-one: the SPA can read this from `GET /academy`, edit
 * fields, and POST/PATCH the same object back without remapping.
 */
export interface Address {
  line1: string;
  line2: string | null;
  city: string;
  postal_code: string;
  province: ItalianProvinceCode;
  country: CountryCode;
}

export interface Academy {
  id: number;
  name: string;
  slug: string;
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
   * Weekdays the academy trains on, as Carbon `dayOfWeek` ints (0=Sun..6=Sat).
   * `null` = "schedule not configured" — daily check-in falls back to
   * all-weekdays. Optional for the same fixture-compat reason as the fee.
   */
  training_days?: number[] | null;
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
  address?: Address | null;
  monthly_fee_cents?: number | null;
  training_days?: number[] | null;
}

interface AcademyResponse {
  data: Academy;
}

@Injectable({ providedIn: 'root' })
export class AcademyService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/academy';

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
  get(options: { forceRefresh?: boolean } = {}): Observable<Academy> {
    if (!options.forceRefresh) {
      const cached = this.academy();
      if (cached) {
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

  uploadLogo(file: File): Observable<Academy> {
    const form = new FormData();
    form.append('logo', file);
    return this.mutate(this.http.post<AcademyResponse>(`${this.base}/logo`, form));
  }

  removeLogo(): Observable<Academy> {
    return this.mutate(this.http.delete<AcademyResponse>(`${this.base}/logo`));
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
