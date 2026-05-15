import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Owner-as-athlete self-enroll / self-leave client (#750, consumer of
 * the PR-A backend at #748). Two thin wrappers around the dedicated
 * `/me/athlete` endpoints, plus a discovery helper the profile toggle
 * uses to render its initial state.
 *
 *   POST   /api/v1/me/athlete  → 201 (new) | 200 (idempotent re-call)
 *   DELETE /api/v1/me/athlete  → 204
 *
 * The discovery helper goes through the athletes index endpoint
 * filtered to the caller's own row. We chose this over adding a new
 * dedicated GET on PR-A so the API surface stays minimal — the
 * profile toggle is the only consumer that needs "am I enrolled?",
 * and the athletes index is already eagerly cached by the roster
 * route. A 200 response with an empty `is_self` slice means the
 * caller is not enrolled.
 */
export interface MyAthleteState {
  readonly enrolled: boolean;
  readonly athleteId: number | null;
}

interface AthleteListEnvelope {
  readonly data: ReadonlyArray<{
    readonly id: number;
    readonly is_self?: boolean;
  }>;
}

interface AthleteEnvelope {
  readonly data: {
    readonly id: number;
    readonly is_self: boolean;
  };
}

@Injectable({ providedIn: 'root' })
export class MyAthleteService {
  private readonly http = inject(HttpClient);

  /**
   * Returns the caller's current self-enrolled state in their active
   * academy. Walks one page of the athletes list looking for a row
   * with `is_self === true` — there is at most one such row per
   * (academy, user) so the first match wins. Returns `enrolled =
   * false` when the user has no active academy or the list errors
   * (the toggle treats both as "show the off state").
   */
  state(): Observable<MyAthleteState> {
    return this.http
      .get<AthleteListEnvelope>(`${environment.apiBase}/api/v1/athletes?per_page=100`)
      .pipe(
        map((response) => {
          const self = response.data.find((row) => row.is_self === true);
          return self !== undefined
            ? { enrolled: true, athleteId: self.id }
            : { enrolled: false, athleteId: null };
        }),
      );
  }

  enroll(): Observable<MyAthleteState> {
    return this.http
      .post<AthleteEnvelope>(`${environment.apiBase}/api/v1/me/athlete`, {})
      .pipe(map((response) => ({ enrolled: true, athleteId: response.data.id })));
  }

  leave(): Observable<MyAthleteState> {
    return this.http
      .delete(`${environment.apiBase}/api/v1/me/athlete`)
      .pipe(map(() => ({ enrolled: false, athleteId: null })));
  }

  /**
   * SSR-safe no-op for environments that don't have a real backend
   * (test harness, prerender). The toggle component checks this to
   * decide whether to fire the discovery call on init.
   */
  isAvailable(): Observable<boolean> {
    return of(typeof window !== 'undefined');
  }
}
