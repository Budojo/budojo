import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Attendance record on the wire — one row in `attendance_records`.
 * Mirrors AttendanceRecordResource.toArray() server-side.
 */
export interface AttendanceRecord {
  id: number;
  athlete_id: number;
  attended_on: string; // YYYY-MM-DD
  notes: string | null;
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
