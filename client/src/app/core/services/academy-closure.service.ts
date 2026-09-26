import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { AcademyClosure } from './academy.service';

/** Both dates every time, `YYYY-MM-DD`; `ends_on` on or after `starts_on`. */
export interface AcademyClosurePayload {
  readonly starts_on: string;
  readonly ends_on: string;
  readonly label: string | null;
}

/**
 * The days the academy is shut (#1766). Reads come with the academy
 * (`Academy.closures`), so after a write the caller refreshes it.
 */
@Injectable({ providedIn: 'root' })
export class AcademyClosureService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/academy/closures`;

  create(payload: AcademyClosurePayload): Observable<AcademyClosure> {
    return this.http.post<{ data: AcademyClosure }>(this.base, payload).pipe(map((r) => r.data));
  }

  update(id: number, payload: AcademyClosurePayload): Observable<AcademyClosure> {
    return this.http
      .patch<{ data: AcademyClosure }>(`${this.base}/${id}`, payload)
      .pipe(map((r) => r.data));
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
