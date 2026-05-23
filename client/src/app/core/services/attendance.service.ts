import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Source of an attendance row (#960). `'instructor'` is the default
 * for every legacy row and for the owner-side widget;  `'self'` is
 * pinned by the athlete-side `POST /me/attendance/today` endpoint.
 */
export type AttendanceSource = 'instructor' | 'self';

/**
 * Attendance record on the wire — one row in `attendance_records`.
 * Mirrors AttendanceRecordResource.toArray() server-side.
 */
export interface AttendanceRecord {
  id: number;
  athlete_id: number;
  attended_on: string; // YYYY-MM-DD
  notes: string | null;
  source: AttendanceSource;
  created_at: string | null;
  deleted_at: string | null;
}

/**
 * Aggregate row from `GET /api/v1/attendance/summary?month=...`.
 * One row per athlete who trained in the month.
 */
export interface AttendanceSummaryRow {
  athlete_id: number;
  first_name: string;
  last_name: string;
  count: number;
}

export interface MarkAttendancePayload {
  /** YYYY-MM-DD; must be today or within the last 7 days. */
  date: string;
  /** Athletes to mark present on `date`. Idempotent — already-marked
   *  ids are no-ops, not 422s. */
  athlete_ids: number[];
}

export interface AttendanceListOptions {
  /** Pass `true` to include soft-deleted (tombstone) records. */
  trashed?: boolean;
}

interface AttendanceListResponse {
  data: AttendanceRecord[];
}

interface AttendanceSummaryResponse {
  data: AttendanceSummaryRow[];
}

/**
 * Peer row in the "Chi viene stasera?" preview (#958). Deliberately
 * narrower than `Athlete`: `last_name_initial` (not full last_name),
 * no email, no phone — defence-in-depth against shoulder-surfing.
 */
export interface TodayPeer {
  readonly id: number;
  readonly first_name: string;
  readonly last_name_initial: string;
  readonly handle: string | null;
  readonly belt: string;
  readonly avatar_url: string | null;
}

/** Discriminated outcomes of `markToday()` — see method docstring. */
export type MarkTodayResult =
  | { status: 'marked'; record: AttendanceRecord }
  | { status: 'not-training-day' }
  | { status: 'no-athlete' };

/** Discriminated outcomes of `unmarkToday()` — see method docstring. */
export type UnmarkTodayResult =
  | { status: 'unmarked' }
  | { status: 'instructor-locked' }
  | { status: 'no-athlete' };

/**
 * Client wrapper for the M4.1 attendance API. Five endpoints, all
 * academy-scoped server-side (see server/app/Http/Controllers/Attendance/
 * AttendanceController.php). All responses are filtered to the
 * authenticated user's academy without the client passing an academy id.
 */
@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/attendance`;

  /**
   * Cross-athlete list for a single date. `date` defaults to today on the
   * server when omitted, but we always pass it explicitly to avoid
   * tying the displayed day to whatever wall-clock the server reads.
   */
  getDaily(date: string, options: AttendanceListOptions = {}): Observable<AttendanceRecord[]> {
    let params = new HttpParams().set('date', date);
    if (options.trashed) {
      params = params.set('trashed', '1');
    }
    return this.http
      .get<AttendanceListResponse>(this.base, { params })
      .pipe(map((res) => res.data));
  }

  /**
   * Bulk idempotent upsert. Re-marking the same athlete on the same day
   * is a no-op, never a 422 — safe to call on optimistic-UI flips that
   * race the server's view of the world.
   */
  markBulk(payload: MarkAttendancePayload): Observable<AttendanceRecord[]> {
    return this.http.post<AttendanceListResponse>(this.base, payload).pipe(map((res) => res.data));
  }

  /**
   * Soft-delete a single attendance record. Used to un-mark a mistakenly
   * tapped athlete. Tombstones still fly out via `getDaily(..., { trashed:
   * true })` for audit/correction views.
   */
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  /**
   * Per-athlete attendance window. Used by the M4.3 calendar tab on the
   * athlete detail page; not consumed by M4.2 daily check-in but shipped
   * here so the client API is complete in one place.
   */
  getAthleteHistory(
    athleteId: number,
    range: { from?: string; to?: string } = {},
  ): Observable<AttendanceRecord[]> {
    let params = new HttpParams();
    if (range.from) params = params.set('from', range.from);
    if (range.to) params = params.set('to', range.to);
    return this.http
      .get<AttendanceListResponse>(
        `${environment.apiBase}/api/v1/athletes/${athleteId}/attendance`,
        { params },
      )
      .pipe(map((res) => res.data));
  }

  /**
   * Athlete-portal attendance history (M7 PR-D slice 3). Returns the
   * authenticated athlete's records — descending by `attended_on`,
   * filtered by the optional `from`/`to` window. Returns `null` on
   * 404 (no linked athlete row → orphan user surface), so the
   * component can render the empty state without subscribing to an
   * error path.
   */
  getMine(range: { from?: string; to?: string } = {}): Observable<AttendanceRecord[] | null> {
    let params = new HttpParams();
    if (range.from) params = params.set('from', range.from);
    if (range.to) params = params.set('to', range.to);
    return this.http
      .get<AttendanceListResponse>(`${environment.apiBase}/api/v1/me/attendance`, { params })
      .pipe(
        map((res) => res.data),
        catchError((err: HttpErrorResponse) =>
          err.status === 404 ? of<AttendanceRecord[] | null>(null) : throwError(() => err),
        ),
      );
  }

  /**
   * Self-mark today's presence (#960). Idempotent — second call
   * returns the existing row instead of erroring; the HTTP status
   * (201 vs 200) distinguishes new vs existing but both unwrap to the
   * same AttendanceRecord shape.
   *
   * Returns:
   *  - `{ status: 'marked', record }` on 200/201 success
   *  - `{ status: 'not-training-day' }` on 422 (today isn't in the academy's training_days)
   *  - `{ status: 'no-athlete' }` on 404 (caller has no linked athlete row)
   *
   * Wraps the four success/error branches into a discriminated union
   * so the component can `@switch` over status without an outer try/
   * catch — matches the pattern used by `WebPushService.subscribe()`.
   */
  markToday(): Observable<MarkTodayResult> {
    return this.http
      .post<{ data: AttendanceRecord }>(`${environment.apiBase}/api/v1/me/attendance/today`, {})
      .pipe(
        map((res) => ({ status: 'marked' as const, record: res.data })),
        catchError((err: HttpErrorResponse) => {
          if (err.status === 422) return of<MarkTodayResult>({ status: 'not-training-day' });
          if (err.status === 404) return of<MarkTodayResult>({ status: 'no-athlete' });
          return throwError(() => err);
        }),
      );
  }

  /**
   * "Chi viene stasera?" peer preview (#958). Returns same-academy
   * athletes who have an active attendance row for today, capped + opt-
   * out-respected server-side. Returns `null` on 404 (no linked athlete
   * row) so the component can render the empty state without an error
   * path — mirrors the `getMine()` shape.
   */
  getTodayPeers(): Observable<TodayPeer[] | null> {
    return this.http
      .get<{ data: TodayPeer[] }>(`${environment.apiBase}/api/v1/me/attendance/today/peers`)
      .pipe(
        map((res) => res.data),
        catchError((err: HttpErrorResponse) =>
          err.status === 404 ? of<TodayPeer[] | null>(null) : throwError(() => err),
        ),
      );
  }

  /**
   * Revert the athlete's own self-mark for today (#960). Idempotent
   * — 204 both when a row was deleted and when none existed.
   *
   * Returns:
   *  - `{ status: 'unmarked' }` on 204
   *  - `{ status: 'instructor-locked' }` on 403 (today's row is
   *     instructor-marked; only the instructor can revert it)
   *  - `{ status: 'no-athlete' }` on 404
   */
  unmarkToday(): Observable<UnmarkTodayResult> {
    return this.http.delete<void>(`${environment.apiBase}/api/v1/me/attendance/today`).pipe(
      map(() => ({ status: 'unmarked' as const })),
      catchError((err: HttpErrorResponse) => {
        if (err.status === 403) return of<UnmarkTodayResult>({ status: 'instructor-locked' });
        if (err.status === 404) return of<UnmarkTodayResult>({ status: 'no-athlete' });
        return throwError(() => err);
      }),
    );
  }

  /**
   * Per-month aggregate count, one row per athlete who trained that
   * month. Used by the M4.4 dashboard summary widget.
   */
  getMonthlySummary(month: string): Observable<AttendanceSummaryRow[]> {
    const params = new HttpParams().set('month', month);
    return this.http
      .get<AttendanceSummaryResponse>(`${this.base}/summary`, { params })
      .pipe(map((res) => res.data));
  }
}
