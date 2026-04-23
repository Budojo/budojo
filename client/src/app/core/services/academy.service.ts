import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, map, tap, catchError, throwError, of, shareReplay, finalize } from 'rxjs';

export interface Academy {
  id: number;
  name: string;
  slug: string;
  address: string | null;
}

export interface CreateAcademyPayload {
  name: string;
  address?: string;
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
}
