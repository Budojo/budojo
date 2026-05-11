import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ApiToken {
  readonly id: number;
  readonly name: string;
  readonly abilities: readonly string[];
  readonly last_used_at: string | null;
  readonly expires_at: string | null;
  readonly created_at: string | null;
}

export interface CreatedApiToken extends ApiToken {
  /** Plaintext bearer token. Returned ONCE on creation. */
  readonly plain_text_token: string;
}

interface ListResponse {
  readonly data: readonly ApiToken[];
  readonly meta: { readonly available_abilities: readonly string[] };
}

interface CreateResponse {
  readonly data: CreatedApiToken;
}

interface DestroyResponse {
  readonly data: { readonly revoked: boolean };
}

/**
 * HTTP surface for the API-tokens panel on
 * `/dashboard/profile` (#431). Maps 1:1 to `/me/api-tokens`.
 */
@Injectable({ providedIn: 'root' })
export class ApiTokenService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/me/api-tokens`;

  list(): Observable<{ tokens: readonly ApiToken[]; availableAbilities: readonly string[] }> {
    return this.http
      .get<ListResponse>(this.base)
      .pipe(map((r) => ({ tokens: r.data, availableAbilities: r.meta.available_abilities })));
  }

  create(payload: {
    name: string;
    abilities: readonly string[];
    expires_in_days?: number | null;
  }): Observable<CreatedApiToken> {
    return this.http.post<CreateResponse>(this.base, payload).pipe(map((r) => r.data));
  }

  revoke(id: number): Observable<boolean> {
    return this.http.delete<DestroyResponse>(`${this.base}/${id}`).pipe(map((r) => r.data.revoked));
  }
}
