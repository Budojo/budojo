import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Wire shape for one row in the user's "Login history" panel (#430).
 * Mirrors `LoginHistoryController::index()` projection on the server.
 */
export interface LoginAttempt {
  readonly id: number;
  readonly success: boolean;
  /** "Chrome on macOS", "Safari on iOS", or "Unknown device". */
  readonly device: string;
  /** Nullable when the request arrived without a recoverable client IP. */
  readonly ip_address: string | null;
  readonly created_at: string;
}

interface ListResponse {
  readonly data: readonly LoginAttempt[];
}

/**
 * HTTP surface for the "Login history" panel on `/dashboard/profile`
 * (#430). Read-only — the audit log is appended exclusively by the
 * server-side `RecordLoginAttemptAction` invoked from the login flow.
 */
@Injectable({ providedIn: 'root' })
export class LoginHistoryService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/me/login-history`;

  list(): Observable<readonly LoginAttempt[]> {
    return this.http.get<ListResponse>(this.base).pipe(map((r) => r.data));
  }
}
