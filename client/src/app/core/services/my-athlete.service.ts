import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Owner-as-athlete self-enroll / self-leave client (#750, consumer of
 * the PR-A backend at #748). Three thin wrappers around the dedicated
 * `/me/athlete` endpoints:
 *
 *   GET    /api/v1/me/athlete/state → { enrolled, athlete_id }
 *   POST   /api/v1/me/athlete       → 201 (new) | 200 (idempotent re-call)
 *   DELETE /api/v1/me/athlete       → 204
 *
 * The `state()` discovery call hits the dedicated `/state` endpoint
 * (#761). The previous implementation walked one page of
 * `/api/v1/athletes` looking for an `is_self === true` row — but the
 * athletes index ignores `per_page` and always paginates 20 items, so
 * on academies with a roster larger than 20 the self-row could sit on
 * a later page and the toggle would silently report `enrolled: false`
 * (Copilot review on #754). The dedicated endpoint queries the
 * (academy_id, user_id, is_self=true) tuple directly so the result is
 * unambiguous regardless of roster size.
 */
export interface MyAthleteState {
  readonly enrolled: boolean;
  readonly athleteId: number | null;
}

interface MeAthleteStateEnvelope {
  readonly data: {
    readonly enrolled: boolean;
    readonly athlete_id: number | null;
  };
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
   * academy. Calls the dedicated `GET /me/athlete/state` endpoint
   * which queries the (academy_id, user_id, is_self=true) tuple
   * directly — no pagination involved, works on any roster size
   * (#761). The server returns `enrolled: false, athlete_id: null`
   * with 200 when the user has no active academy, so the toggle
   * doesn't need a separate "no academy" branch.
   */
  state(): Observable<MyAthleteState> {
    return this.http
      .get<MeAthleteStateEnvelope>(`${environment.apiBase}/api/v1/me/athlete/state`)
      .pipe(
        map((response) => ({
          enrolled: response.data.enrolled,
          athleteId: response.data.athlete_id,
        })),
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
