import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { SkeletonModule } from 'primeng/skeleton';
import { AttendanceRecord, AttendanceService } from '../../core/services/attendance.service';
import { AttendanceSummaryChartComponent } from '../../shared/components/attendance-summary-chart/attendance-summary-chart.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

/**
 * Athlete-portal attendance history page (M7 PR-D slice 3). Read-only
 * descending list of the user's own training sessions, with a small
 * "month/year" summary at the top.
 *
 * V1 ships the unfiltered window (everything since the user's first
 * mat day). Date filters land in slice 4 (Payments) if/when the
 * design proves the need; for now the descending list is short
 * enough that visual scanning is the right UX.
 */
@Component({
  selector: 'app-my-attendance',
  standalone: true,
  imports: [
    PageHeaderComponent,
    TranslatePipe,
    DatePipe,
    SkeletonModule,
    AttendanceSummaryChartComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-attendance.component.html',
  styleUrl: './my-attendance.component.scss',
})
export class MyAttendanceComponent implements OnInit {
  private readonly attendanceService = inject(AttendanceService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly records = signal<readonly AttendanceRecord[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly noProfile = signal(false);

  /**
   * Athlete id for the `<app-attendance-summary-chart>` (#894). The
   * `/me/attendance` payload carries `athlete_id` on every row; we
   * pluck it from the first one. When the user has zero records ever,
   * the chart simply isn't rendered (the existing empty-state already
   * covers that branch — no point asking the chart endpoint for a
   * zero-data window).
   */
  protected readonly chartAthleteId = computed<number | null>(
    () => this.records()[0]?.athlete_id ?? null,
  );

  /**
   * Last-30-days session count — a single number under the page
   * title that gives the athlete a quick "am I training consistently?"
   * answer without reading the whole list.
   *
   * The cutoff string is built from LOCAL date components, not
   * `toISOString().slice(0,10)` — the latter converts to UTC and
   * can shift the calendar day by one in non-UTC timezones (Copilot
   * review on PR #622).
   */
  protected readonly last30Count = computed(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = this.toLocalIsoDate(cutoff);
    return this.records().filter((r) => r.attended_on >= cutoffStr).length;
  });

  /**
   * Parse the wire's `YYYY-MM-DD` string as a LOCAL date — bypasses
   * the JS engine's default UTC interpretation of date-only strings,
   * which would shift the rendered calendar day in non-UTC TZs
   * (Copilot review on PR #622). Splitting on `-` and feeding the
   * year/month/day to the Date constructor keeps the day stable.
   */
  protected toLocalDate(value: string): Date {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  private toLocalIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  ngOnInit(): void {
    this.attendanceService
      .getMine()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (records) => {
          if (records === null) {
            this.noProfile.set(true);
          } else {
            this.records.set(records);
          }
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.loadError.set(true);
        },
      });
  }
}
