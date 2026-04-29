import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
// Address types live in academy.service for now (#72a); re-imported here
// instead of duplicated. If a third owner shows up the types should move
// to a dedicated `address.types.ts` and both services should import from
// there — Rule of Three for the extraction trigger.
import { Address } from './academy.service';
import { environment } from '../../../environments/environment';

export type Belt = 'white' | 'blue' | 'purple' | 'brown' | 'black';
export type AthleteStatus = 'active' | 'suspended' | 'inactive';

export interface Athlete {
  id: number;
  first_name: string;
  last_name: string;
  email: string | null;
  /**
   * E.164 prefix including the leading `+`, e.g. `+39`. Always paired with
   * `phone_national_number` — both are null OR both carry a value (#75).
   */
  phone_country_code: string | null;
  /**
   * Unformatted national digits, e.g. `3331234567`. Always paired with
   * `phone_country_code`. Display formatting (spacing, parentheses) is the
   * caller's concern.
   */
  phone_national_number: string | null;
  /**
   * Contact links (#162) — three independently nullable URLs. The SPA
   * renders these as external links on the athlete detail page; the
   * form accepts each independently. Optional on this interface for
   * fixture-compat (the wire shape always includes them from #162 on).
   */
  website?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  date_of_birth: string | null;
  belt: Belt;
  stripes: number;
  status: AthleteStatus;
  joined_at: string;
  /**
   * Structured address (#72b). `null` means no address on file. Same
   * read/write asymmetry as Academy: writes require every field except
   * `line2`; reads may carry nulls for legacy rows backfilled from a
   * pre-#72 freeform column (athletes had no freeform column historically,
   * but the type is shared with Academy so the asymmetry is uniform).
   */
  address: Address | null;
  created_at: string;
  /**
   * Derived server-side: true iff a row exists in `athlete_payments` for
   * the current calendar month. Marked optional to keep existing test
   * fixtures and Cypress mocks compiling — the wire shape ALWAYS includes
   * it from #104 onward; #105 (paid badge + filter) tightens to required.
   */
  paid_current_month?: boolean;
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

export type AthletePaidFilter = 'yes' | 'no';

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
  /**
   * `yes` filters down to athletes who have paid for the current calendar
   * month; `no` to those who haven't. Server-side filter (#105) because the
   * list is paginated — a client-side sweep would only see the current 20
   * rows. Hidden in the UI when the academy hasn't configured a fee.
   */
  paid?: AthletePaidFilter;
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
  /**
   * Structured phone (#75) — both country code and national number must be
   * sent together (or both omitted/null). The backend cross-validates the
   * pair against libphonenumber.
   */
  phone_country_code?: string | null;
  phone_national_number?: string | null;
  /**
   * Contact links (#162) — three independently nullable URLs. Each field
   * may be sent on create or update; `null` clears it.
   */
  website?: string | null;
  facebook?: string | null;
  instagram?: string | null;
  date_of_birth?: string | null;
  belt: Belt;
  stripes: number;
  status: AthleteStatus;
  joined_at: string;
  /**
   * Structured address (#72b). Three-way semantics:
   *   - omit the key → no change (server leaves the existing row untouched)
   *   - `null` → delete the existing morph row
   *   - `Address` object → upsert (create or replace in place)
   */
  address?: Address | null;
}

export type AthleteUpdatePayload = Partial<AthletePayload>;

interface AthleteResponse {
  data: Athlete;
}

@Injectable({ providedIn: 'root' })
export class AthleteService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/athletes`;

  list(filters: AthleteFilters = {}): Observable<AthleteListResponse> {
    let params = new HttpParams();
    if (filters.belt) params = params.set('belt', filters.belt);
    if (filters.status) params = params.set('status', filters.status);
    if (filters.page) params = params.set('page', filters.page.toString());
    if (filters.sortBy) params = params.set('sort_by', filters.sortBy);
    if (filters.sortOrder) params = params.set('sort_order', filters.sortOrder);
    if (filters.q) params = params.set('q', filters.q);
    if (filters.paid) params = params.set('paid', filters.paid);
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
