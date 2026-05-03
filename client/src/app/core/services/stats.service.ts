import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DailyAttendancePoint {
  readonly date: string; // 'YYYY-MM-DD'
  readonly count: number;
}

export interface MonthlyPaymentsBucket {
  readonly month: string; // 'YYYY-MM'
  readonly currency: string;
  readonly amount_cents: number;
}

export type AgeBandCode =
  | 'mighty_mite'
  | 'pee_wee'
  | 'junior'
  | 'teen'
  | 'juvenile'
  | 'adult'
  | 'master_1'
  | 'master_2'
  | 'master_3'
  | 'master_4'
  | 'master_5'
  | 'master_6'
  | 'master_7';

export interface AgeBand {
  readonly code: AgeBandCode;
  readonly category: 'kids' | 'adults';
  readonly min: number;
  readonly max: number | null;
  readonly count: number;
}

export interface AgeBandsPayload {
  readonly bands: readonly AgeBand[];
  readonly total: number;
  readonly missing_dob: number;
}

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly http = inject(HttpClient);

  attendanceDaily(months: 3 | 6 | 12 = 3): Observable<readonly DailyAttendancePoint[]> {
    return this.http
      .get<{
        data: DailyAttendancePoint[];
      }>(`${environment.apiBase}/api/v1/stats/attendance/daily?months=${months}`)
      .pipe(map((r) => r.data));
  }

  paymentsMonthly(months = 12): Observable<readonly MonthlyPaymentsBucket[]> {
    return this.http
      .get<{
        data: MonthlyPaymentsBucket[];
      }>(`${environment.apiBase}/api/v1/stats/payments/monthly?months=${months}`)
      .pipe(map((r) => r.data));
  }

  ageBands(): Observable<AgeBandsPayload> {
    return this.http
      .get<{ data: AgeBandsPayload }>(`${environment.apiBase}/api/v1/stats/athletes/age-bands`)
      .pipe(map((r) => r.data));
  }
}
