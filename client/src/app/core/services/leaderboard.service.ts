import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Top-5 mat-hours leaderboard row (#962). Anonymised rows zero out
 * the first_name + last_name_initial (the SPA renders "Anonimo" in
 * that case) but keep the rank + sessions + hours so the order
 * reads faithfully.
 */
export interface LeaderboardRow {
  readonly rank: number;
  readonly athlete_id: number;
  readonly first_name: string;
  readonly last_name_initial: string;
  readonly sessions: number;
  readonly hours: number;
  readonly anonymous: boolean;
  readonly is_self: boolean;
}

export interface LeaderboardPage {
  readonly data: readonly LeaderboardRow[];
  readonly meta: { readonly month: string };
}

/** Discriminated outcomes of `getLeaderboard()`. */
export type LeaderboardResult =
  | { status: 'ok'; page: LeaderboardPage }
  | { status: 'no-academy' }
  | { status: 'bad-month' };

@Injectable({ providedIn: 'root' })
export class LeaderboardService {
  private readonly http = inject(HttpClient);

  /**
   * Fetch the monthly mat-hours leaderboard (#962). `month` is
   * optional — server defaults to the current month when omitted.
   * Format `YYYY-MM`.
   */
  getLeaderboard(month?: string): Observable<LeaderboardResult> {
    let params = new HttpParams();
    if (month) params = params.set('month', month);
    return this.http
      .get<LeaderboardPage>(`${environment.apiBase}/api/v1/attendance/leaderboard`, {
        params,
      })
      .pipe(
        map((page) => ({ status: 'ok' as const, page })),
        catchError((err: HttpErrorResponse) => {
          if (err.status === 404) return of<LeaderboardResult>({ status: 'no-academy' });
          if (err.status === 422) return of<LeaderboardResult>({ status: 'bad-month' });
          return throwError(() => err);
        }),
      );
  }
}
