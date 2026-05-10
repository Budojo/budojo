import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

interface CancelResponse {
  readonly data: { readonly cancelled: boolean };
}

/**
 * Account-deletion HTTP surface (#545 — email-link cancel flow).
 *
 * Currently only carries the public, token-bound cancel call wired to
 * the email CTA. The authenticated `POST /me/deletion-request` (request
 * deletion) and `DELETE /me/deletion-request` (cancel while signed in)
 * endpoints exist on the API since #223 but don't have a UI surface
 * yet — when the profile page lands those, this service is the natural
 * home. Keeping the file scoped to "what's wired to UI today" follows
 * the rest of the SPA's service shape (one service per visible feature).
 */
@Injectable({ providedIn: 'root' })
export class AccountDeletionService {
  private readonly http = inject(HttpClient);

  /**
   * Public, unauthenticated call. The 64-char token comes from the URL
   * (the user clicked the CTA in the deletion-confirmation email and
   * landed on the public SPA cancel page). Resolves to:
   *
   * - `true`  — token matched an active row, the row is gone, account safe.
   * - `false` — already-clicked / never valid / already purged. The page
   *   renders one "deletion is no longer pending" panel either way; we
   *   don't leak whether the link was used vs invalid.
   *
   * The API returns 200 in both cases (4xx is reserved for malformed
   * route shape, which the route binding rejects before the controller
   * ever fires). A network error reaches the caller's `error` arm and
   * the page shows a generic retry CTA.
   */
  cancelByToken(token: string): Observable<boolean> {
    return this.http
      .post<CancelResponse>(`/api/v1/me/deletion-request/cancel/${token}`, {})
      .pipe(map((response) => response.data.cancelled));
  }
}
