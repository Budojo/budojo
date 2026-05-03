import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface MonthlyAttendanceBucket {
  readonly month: string; // 'YYYY-MM'
  readonly attendance_count: number;
  readonly training_days: number;
}

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly http = inject(HttpClient);

  attendanceMonthly(months = 12): Observable<readonly MonthlyAttendanceBucket[]> {
    return this.http
      .get<{
        data: MonthlyAttendanceBucket[];
      }>(`${environment.apiBase}/api/v1/stats/attendance/monthly?months=${months}`)
      .pipe(map((r) => r.data));
  }
}
