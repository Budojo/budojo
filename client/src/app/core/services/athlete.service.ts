import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';

export type Belt = 'white' | 'blue' | 'purple' | 'brown' | 'black';
export type AthleteStatus = 'active' | 'suspended' | 'inactive';

export interface Athlete {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  belt: Belt;
  stripes: number;
  status: AthleteStatus;
  joined_at: string;
  created_at: string;
}

export interface AthleteMeta {
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}

export interface AthleteListResponse {
  data: Athlete[];
  meta: AthleteMeta;
}

export type AthleteSortField = 'first_name' | 'last_name' | 'belt' | 'joined_at' | 'created_at';

export type AthleteSortOrder = 'asc' | 'desc';

export interface AthleteFilters {
  belt?: Belt;
  status?: AthleteStatus;
  page?: number;
  sortBy?: AthleteSortField;
  sortOrder?: AthleteSortOrder;
  /**
   * Free-text name search forwarded to the backend as `?q=...`. Tokens are
   * AND-matched across first_name and last_name — see OpenAPI spec for the
   * exact semantics. Whitespace-only values should be stripped before this
   * field is set.
   */
  q?: string;
}

/**
 * Payload accepted by POST /api/v1/athletes and PUT /api/v1/athletes/{id}.
 * Dates are ISO date strings in YYYY-MM-DD format.
 * On update, all fields are optional (partial update).
 */
export interface AthletePayload {
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  belt: Belt;
  stripes: number;
  status: AthleteStatus;
  joined_at: string;
}

export type AthleteUpdatePayload = Partial<AthletePayload>;

interface AthleteResponse {
  data: Athlete;
}

@Injectable({ providedIn: 'root' })
export class AthleteService {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/athletes';

  list(filters: AthleteFilters = {}): Observable<AthleteListResponse> {
    let params = new HttpParams();
    if (filters.belt) params = params.set('belt', filters.belt);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.page) params = params.set('page', filters.page.toString());
    if (filters.sortBy) params = params.set('sort_by', filters.sortBy);
    if (filters.sortOrder) params = params.set('sort_order', filters.sortOrder);
    if (filters.q) params = params.set('q', filters.q);
    return this.http.get<AthleteListResponse>(this.base, { params });
  }

  get(id: number): Observable<Athlete> {
    return this.http.get<AthleteResponse>(`${this.base}/${id}`).pipe(map((res) => res.data));
  }

  create(payload: AthletePayload): Observable<Athlete> {
    return this.http.post<AthleteResponse>(this.base, payload).pipe(map((res) => res.data));
  }

  update(id: number, payload: AthleteUpdatePayload): Observable<Athlete> {
    return this.http
      .put<AthleteResponse>(`${this.base}/${id}`, payload)
      .pipe(map((res) => res.data));
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
