import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

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

export interface AthleteFilters {
  belt?: Belt;
  status?: AthleteStatus;
  page?: number;
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
    return this.http.get<AthleteListResponse>(this.base, { params });
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
