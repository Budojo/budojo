import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { TrainingMode } from './academy.service';

/**
 * One recurring slot on the academy's weekly timetable (#1562).
 *
 * `weekday` follows Carbon's `dayOfWeek` — 0 is Sunday, 6 is Saturday — the
 * same convention as `training_days`, so the two never need translating.
 * `starts_at` is `HH:MM` or null for an academy that does not run by the clock.
 */
export interface AcademyClass {
  readonly id: number;
  readonly name: string;
  readonly weekday: number;
  readonly starts_at: string | null;
  readonly duration_minutes: number | null;
  /**
   * What the class is trained in (#1562, #1803): one of the academy's two
   * modes, `both` or `other`. A dimension of the class, not a tag on a lesson.
   */
  readonly kind: TrainingMode;
}

export interface AcademyClassPayload {
  readonly name: string;
  readonly weekday: number;
  readonly starts_at: string | null;
  readonly duration_minutes: number | null;
  readonly kind: TrainingMode;
}

@Injectable({ providedIn: 'root' })
export class AcademyClassService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/academy/classes`;

  /** The whole week, ordered by day then time by the server. */
  list(): Observable<AcademyClass[]> {
    return this.http.get<{ data: AcademyClass[] }>(this.base).pipe(map((r) => r.data));
  }

  create(payload: AcademyClassPayload): Observable<AcademyClass> {
    return this.http.post<{ data: AcademyClass }>(this.base, payload).pipe(map((r) => r.data));
  }

  update(id: number, payload: Partial<AcademyClassPayload>): Observable<AcademyClass> {
    return this.http
      .patch<{ data: AcademyClass }>(`${this.base}/${id}`, payload)
      .pipe(map((r) => r.data));
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
