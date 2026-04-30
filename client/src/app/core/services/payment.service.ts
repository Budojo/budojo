import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Athlete payment ledger (#182). Surface 1 — mark paid / mark unpaid
 * for a specific (athlete, year, month). Surface 2 (per-athlete
 * payment history tab) is a follow-up; this service only exposes the
 * two write operations the athletes-list inline toggle needs today.
 *
 * Server contract reference: `docs/api/v1.yaml` §
 * /athletes/{athlete}/payments and
 * /athletes/{athlete}/payments/{year}/{month}.
 *
 * - POST is **idempotent** — re-posting the same (year, month) returns
 *   the existing row. The client doesn't need to dedupe; the server does.
 * - DELETE returns 204; the absence of a row IS the canonical "unpaid"
 *   state (no soft-delete tombstone in the schema).
 * - 422 on POST when the academy has no `monthly_fee_cents` configured —
 *   the UI is supposed to gate the click on `hasMonthlyFee()` so this
 *   shouldn't surface in normal use; treat it as an edge-case error.
 */
export interface AthletePayment {
  readonly id: number;
  readonly athlete_id: number;
  readonly year: number;
  readonly month: number;
  readonly amount_cents: number;
  readonly paid_at: string;
}

interface AthletePaymentResponse {
  data: AthletePayment;
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/athletes`;

  /**
   * Record (or re-confirm) a payment for the given (athlete, year, month).
   * Idempotent on the server — calling twice does not duplicate rows.
   */
  markPaid(athleteId: number, year: number, month: number): Observable<AthletePayment> {
    return this.http
      .post<AthletePaymentResponse>(`${this.base}/${athleteId}/payments`, { year, month })
      .pipe(map((res) => res.data));
  }

  /**
   * Reverse the paid state for (athlete, year, month). 404 from the
   * server means the row was already gone — the user's intent was
   * "make it unpaid", and the end state matches, so we map 404 to
   * a successful empty completion. Any other status (network error,
   * 401, 403, 5xx) propagates as an error to the caller.
   *
   * This idempotency is the symmetric twin of the POST side: the
   * server makes POST idempotent by returning the existing row;
   * we make DELETE idempotent here by swallowing the 404. Without
   * it, a double-click race or a stale list would surface a spurious
   * "Couldn't update" toast on a state the user already wanted (#259
   * Copilot review).
   */
  unmarkPaid(athleteId: number, year: number, month: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${athleteId}/payments/${year}/${month}`).pipe(
      // `of(undefined)` (not `EMPTY`) so the subscriber's `next`
      // still fires — the caller's optimistic flip + success toast
      // live in `next`, and we want both to run on the 404 → success
      // path the same as on a real 204.
      catchError((err: HttpErrorResponse) =>
        err.status === 404 ? of(undefined) : throwError(() => err),
      ),
    );
  }
}
