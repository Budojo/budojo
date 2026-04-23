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

    this.inflight$ = this.http.get<AcademyResponse>(this.base).pipe(
      tap((res) => this.academy.set(res.data)),
      map((res) => res.data),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 404 || err.status === 401) {
          this.academy.set(null);
        }
        return throwError(() => err);
      }),
      finalize(() => {
        this.inflight$ = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );

    return this.inflight$;
  }

  create(payload: CreateAcademyPayload): Observable<Academy> {
    return this.http.post<AcademyResponse>(this.base, payload).pipe(
      tap((res) => this.academy.set(res.data)),
      map((res) => res.data),
    );
  }

  clear(): void {
    this.academy.set(null);
    this.inflight$ = null;
  }
}
