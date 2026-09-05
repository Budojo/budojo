import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, of, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * Entry carnets (#1364) — the pre-paid alternative to the monthly fee.
 *
 * Server contract: `docs/api/v1.yaml` § /athletes/{athlete}/carnets.
 *
 * - `remaining_entries` and `is_active` are **derived server-side** from the
 *   consumption ledger. Never recompute them here: the client has no view of
 *   the ledger, and a second implementation of the rule is how the two drift.
 * - `code`, `price_cents` and `total_entries` are generated / snapshotted by
 *   the server and ignored if sent — the sell payload carries at most a
 *   purchase date.
 * - 422 on sell when the academy hasn't configured its carnet offering. The
 *   UI gates on that upfront, same as the monthly-fee gate, so it should not
 *   surface in normal use.
 */
export interface Carnet {
  readonly id: number;
  readonly code: string;
  readonly athlete_id: number;
  readonly total_entries: number;
  readonly remaining_entries: number;
  readonly price_cents: number;
  readonly purchased_at: string;
  readonly expires_at: string;
  readonly is_active: boolean;
}

export interface CarnetEntry {
  readonly id: number;
  readonly carnet_id: number;
  readonly attendance_record_id: number;
  readonly used_on: string;
}

interface CarnetResponse {
  data: Carnet;
}

interface CarnetListResponse {
  data: Carnet[];
}

interface CarnetEntryListResponse {
  data: CarnetEntry[];
}

@Injectable({ providedIn: 'root' })
export class CarnetService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/api/v1/athletes`;

  /** Every carnet the athlete has ever held, newest purchase first. */
  list(athleteId: number): Observable<Carnet[]> {
    return this.http
      .get<CarnetListResponse>(`${this.base}/${athleteId}/carnets`)
      .pipe(map((res) => res.data));
  }

  /**
   * Sell one carnet. `purchasedAt` (YYYY-MM-DD) back-dates the sale when the
   * owner is transcribing a paper register; omitted means today. The server
   * rejects a future date.
   */
  sell(athleteId: number, purchasedAt?: string): Observable<Carnet> {
    const body = purchasedAt ? { purchased_at: purchasedAt } : {};
    return this.http
      .post<CarnetResponse>(`${this.base}/${athleteId}/carnets`, body)
      .pipe(map((res) => res.data));
  }

  /** The sessions one carnet paid for, most recent first. */
  entries(athleteId: number, carnetId: number): Observable<CarnetEntry[]> {
    return this.http
      .get<CarnetEntryListResponse>(`${this.base}/${athleteId}/carnets/${carnetId}/entries`)
      .pipe(map((res) => res.data));
  }

  /**
   * The authenticated athlete's own carnets. 404 maps to `null` so the
   * portal renders its "no profile" state without an error path — same shape
   * as `PaymentService.listMine`.
   */
  listMine(): Observable<Carnet[] | null> {
    return this.http.get<CarnetListResponse>(`${environment.apiBase}/api/v1/me/carnets`).pipe(
      map((res) => res.data),
      catchError((err: HttpErrorResponse) =>
        err.status === 404 ? of<Carnet[] | null>(null) : throwError(() => err),
      ),
    );
  }
}
