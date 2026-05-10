import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Status payload returned by `GET /me/two-factor`. Mirrors the
 * controller projection on the server. Three states encoded:
 *
 * - `enabled=false, pending=false` → user never enrolled.
 * - `enabled=false, pending=true`  → secret minted, awaiting TOTP
 *   confirmation (the QR-code-shown state).
 * - `enabled=true`                 → fully active, `recovery_codes_remaining`
 *   reflects current backup-code count.
 */
export interface TwoFactorStatus {
  readonly enabled: boolean;
  readonly pending: boolean;
  readonly recovery_codes_remaining: number;
}

export interface TwoFactorEnrolment {
  readonly secret: string;
  readonly provisioning_uri: string;
}

interface StatusResponse {
  readonly data: TwoFactorStatus;
}
interface EnrolResponse {
  readonly data: TwoFactorEnrolment;
}
interface RecoveryCodesResponse {
  readonly data: { readonly recovery_codes: readonly string[] };
}
interface DisableResponse {
  readonly data: { readonly disabled: boolean };
}

/**
 * HTTP surface for the TOTP 2FA management panel on
 * `/dashboard/profile/two-factor` (#412). Backs `ProfileTwoFactorComponent`
 * + the login challenge step.
 */
@Injectable({ providedIn: 'root' })
export class TwoFactorService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/me/two-factor`;

  status(): Observable<TwoFactorStatus> {
    return this.http.get<StatusResponse>(this.base).pipe(map((r) => r.data));
  }

  enrol(): Observable<TwoFactorEnrolment> {
    return this.http.post<EnrolResponse>(`${this.base}/enrol`, {}).pipe(map((r) => r.data));
  }

  confirm(code: string): Observable<readonly string[]> {
    return this.http
      .post<RecoveryCodesResponse>(`${this.base}/confirm`, { code })
      .pipe(map((r) => r.data.recovery_codes));
  }

  regenerateRecoveryCodes(): Observable<readonly string[]> {
    return this.http
      .post<RecoveryCodesResponse>(`${this.base}/recovery-codes/regenerate`, {})
      .pipe(map((r) => r.data.recovery_codes));
  }

  /** Requires the current password — defense in depth against stolen sessions. */
  disable(password: string): Observable<boolean> {
    return this.http
      .request<DisableResponse>('delete', this.base, { body: { password } })
      .pipe(map((r) => r.data.disabled));
  }
}
