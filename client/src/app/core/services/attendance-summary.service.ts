import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Single entry in the sparkline series — one per realized lesson day. */
export interface AttendanceSummarySeriesPoint {
  readonly date: string;
  readonly attended: boolean;
}

/** Composite response from `GET /api/v1/athletes/{athlete}/attendance/summary`. */
export interface AttendanceSummary {
  readonly range_days: 30 | 90 | 365;
  readonly range_start: string;
  readonly range_end: string;
  readonly attended_count: number;
  readonly expected_count: number;
  /**
   * Fraction in [0, 1] of realized lesson days the athlete attended.
   * `null` when `expected_count === 0` (no lessons in the window) — the
   * UI must NOT render `0%` for that branch (misleading).
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
    const params = new HttpParams().set('range', String(range));
    return this.http
      .get<{
        data: AttendanceSummary;
      }>(`${this.base}/athletes/${athleteId}/attendance/summary`, { params })
      .pipe(map((envelope) => envelope.data));
  }
}
