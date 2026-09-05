import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * One line of the academy's monthly price list (#1381).
 *
 * `lessons_per_week` is structured rather than baked into the label so the app
 * can eventually ask questions of it — "this athlete is on the 2-lesson tier
 * and trained four times last week" is the sort of thing an attendance
 * register exists to notice, and a free-text label cannot be asked.
 */
export interface FeeTier {
  readonly id: number;
  readonly label: string;
  readonly amount_cents: number;
  readonly lessons_per_week: number;
  /** How many athletes are on this tier — what makes deleting one a decision. */
  readonly athletes_count: number;
}

export interface FeeTierPayload {
  readonly label: string;
  readonly amount_cents: number;
  readonly lessons_per_week: number;
}

@Injectable({ providedIn: 'root' })
export class FeeTierService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/academy/fee-tiers`;

  list(): Observable<FeeTier[]> {
    return this.http.get<{ data: FeeTier[] }>(this.base).pipe(map((r) => r.data));
  }

  create(payload: FeeTierPayload): Observable<FeeTier> {
    return this.http.post<{ data: FeeTier }>(this.base, payload).pipe(map((r) => r.data));
  }

  update(id: number, payload: FeeTierPayload): Observable<FeeTier> {
    return this.http
      .patch<{ data: FeeTier }>(`${this.base}/${id}`, payload)
      .pipe(map((r) => r.data));
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
