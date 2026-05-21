import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AuditEntry {
  readonly id: number;
  readonly action: string;
  readonly actor_user_id: number | null;
  readonly actor_label: string | null;
  readonly subject_type: string | null;
  readonly subject_id: number | null;
  readonly subject_label: string | null;
  readonly before: Record<string, unknown> | null;
  readonly after: Record<string, unknown> | null;
  readonly ip: string | null;
  readonly user_agent: string | null;
  readonly created_at: string;
}

export interface AuditEntriesPage {
  readonly data: readonly AuditEntry[];
  readonly meta: {
    readonly current_page: number;
    readonly last_page: number;
    readonly total: number;
    readonly per_page: number;
  };
}

export interface AuditEntriesFilters {
  readonly action?: string;
  readonly actor_user_id?: number;
  readonly from?: string;
  readonly to?: string;
  readonly subject_type?: string;
  readonly subject_id?: number;
  readonly per_page?: number;
  readonly page?: number;
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1`;

  list(filters: AuditEntriesFilters = {}): Observable<AuditEntriesPage> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }
    return this.http.get<AuditEntriesPage>(`${this.base}/audit-entries`, { params });
  }
}
