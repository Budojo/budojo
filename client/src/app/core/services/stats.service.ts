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
}
