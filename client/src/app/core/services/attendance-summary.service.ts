import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Single entry in the strip: one per scheduled day, plus any other day they trained (#1769). */
export interface AttendanceSummarySeriesPoint {
  readonly date: string;
  readonly attended: boolean;
}

/** Composite response from `GET /api/v1/athletes/{athlete}/attendance/summary`. */
export interface AttendanceSummary {
  /** The window's length in days: 30, 90 or 365, or the month's (#1769). */
  readonly range_days: number;
  readonly range_start: string;
  readonly range_end: string;
  /**
   * Where this athlete's window begins (#1769): the joining day, or their
   * first presence if earlier, never before `range_start`. No day before it
   * is counted, so the calendar paints none as missed.
   */
  readonly window_start: string;
  readonly attended_count: number;
  /**
   * The days the academy was scheduled to train in the window (#1769),
   * closures out, up to today, from the athlete's joining day (or first
   * presence, if earlier). Null when no schedule was ever configured.
   */
  readonly expected_count: number | null;
  /**
   * Attended over scheduled. May pass 1: an off-schedule session is real
   * training. `null` when there is no denominator or it is zero — the UI must
   * NOT render `0%` for that branch (misleading).
   */
  readonly rate: number | null;
  readonly series: readonly AttendanceSummarySeriesPoint[];
}

export type AttendanceSummaryRange = 30 | 90 | 365;

/**
 * Thin HTTP client for the attendance-summary endpoint (#893). The
 * shared `<app-attendance-summary-chart>` reads via this service so the
 * three call sites (athlete detail, `/me/attendance`, future `/me`
 * dashboard card) share one code path + one error envelope.
 */
@Injectable({ providedIn: 'root' })
export class AttendanceSummaryService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1`;

  fetch(athleteId: number, range: AttendanceSummaryRange = 90): Observable<AttendanceSummary> {
    return this.get(athleteId, new HttpParams().set('range', String(range)));
  }

  /**
   * The same question over a calendar month, `YYYY-MM` (#1769): the athlete
   * tab's ring asks it, so the ring and the card divide by one rule.
   */
  fetchMonth(athleteId: number, month: string): Observable<AttendanceSummary> {
    return this.get(athleteId, new HttpParams().set('month', month));
  }

  private get(athleteId: number, params: HttpParams): Observable<AttendanceSummary> {
    return this.http
      .get<{
        data: AttendanceSummary;
      }>(`${this.base}/athletes/${athleteId}/attendance/summary`, { params })
      .pipe(map((envelope) => envelope.data));
  }
}
