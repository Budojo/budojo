import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Wire shape for `GET /api/v1/me/recap?week=YYYY-MM-DD` (#960). Mirrors
 * `WeeklyRecapResult` server-side. Partners carry first_name +
 * last_name_initial only — defence-in-depth against full-name leak
 * on a shared mobile screen.
 */
export interface WeeklyRecap {
  readonly iso_week_start: string; // YYYY-MM-DD (Monday)
  readonly sessions: number;
  readonly hours: number;
  readonly partners: readonly WeeklyRecapPartner[];
}

export interface WeeklyRecapPartner {
  readonly first_name: string;
  readonly last_name_initial: string;
}

/** Discriminated outcomes of `getRecap()`. */
export type GetRecapResult =
  { status: 'ok'; recap: WeeklyRecap } | { status: 'no-athlete' } | { status: 'bad-week' };

@Injectable({ providedIn: 'root' })
export class WeeklyRecapService {
  private readonly http = inject(HttpClient);

  /**
   * Fetch the recap for a given Monday-start ISO week (#960). Maps
   * the 404 / 422 status spread to a discriminated union so the page
   * `@switch`es over a single key without an outer try/catch — same
   * pattern as the attendance self-mark service.
   */
  getRecap(isoWeekStart: string): Observable<GetRecapResult> {
    const params = new HttpParams().set('week', isoWeekStart);
    return this.http
      .get<{ data: WeeklyRecap }>(`${environment.apiBase}/api/v1/me/recap`, { params })
      .pipe(
        map((res) => ({ status: 'ok' as const, recap: res.data })),
        catchError((err: HttpErrorResponse) => {
          if (err.status === 404) return of<GetRecapResult>({ status: 'no-athlete' });
          if (err.status === 422) return of<GetRecapResult>({ status: 'bad-week' });
          return throwError(() => err);
        }),
      );
  }
}
