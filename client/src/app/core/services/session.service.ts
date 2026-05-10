import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Wire shape for one row in the user's "Active sessions" list (#413).
 * Mirrors `SessionController::index()` projection on the server.
 */
export interface ActiveSession {
  readonly id: number;
  /** "Chrome on macOS", "Safari on iOS", or "Unknown device". */
  readonly name: string;
  readonly last_used_at: string | null;
  readonly created_at: string | null;
  readonly is_current: boolean;
}

interface ListResponse {
  readonly data: readonly ActiveSession[];
}

interface RevokeOthersResponse {
  readonly data: { readonly revoked: number };
}

/**
 * HTTP surface for the "Active sessions" panel on `/dashboard/profile`
 * (#413). Backs the index, single-revoke, and revoke-all-others
 * endpoints exposed by `App\Http\Controllers\User\SessionController`.
 *
 * Keeping the call shape thin — the component projects the raw rows
 * directly. No client-side caching: the list is short, the user
 * usually visits the panel once per concern, and a refetch after a
 * revoke is the cheapest way to keep the rendered state honest.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/me/sessions`;

  list(): Observable<readonly ActiveSession[]> {
    return this.http.get<ListResponse>(this.base).pipe(map((r) => r.data));
  }

  /**
   * Revoke a single session by id. Resolves on 204; the caller
   * should refetch the list to reflect the deletion. Revoking the
   * CURRENT session is allowed — the next request from the same tab
   * will get 401 and the auth interceptor bounces to /auth/login.
   */
  revoke(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  /**
   * Revoke every OTHER session and keep the current one (the
   * "logout everywhere except here" pattern). Returns the count of
   * rows actually revoked so the caller can flash a confirmation
   * toast — `0` when the user only had this session.
   */
  revokeOthers(): Observable<number> {
    return this.http.delete<RevokeOthersResponse>(this.base).pipe(map((r) => r.data.revoked));
  }
}
