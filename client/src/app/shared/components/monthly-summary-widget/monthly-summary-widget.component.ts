import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { SkeletonModule } from 'primeng/skeleton';
import { AcademyService } from '../../../core/services/academy.service';
import { AttendanceService, AttendanceSummaryRow } from '../../../core/services/attendance.service';
import { attendanceRate, countScheduledTrainingDays } from '../../utils/attendance-rate';

/**
 * YYYY-MM for the current calendar month, derived from local components so the
 * label matches what the user reads on the wall clock — `toISOString()` would
 * shift to UTC and could pick the wrong month near midnight in non-UTC TZs.
 */
function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Dashboard widget: top training-day counts for the current month.
 *
 * Same shape as `ExpiringDocumentsWidgetComponent` — self-contained fetch on
 * init, skeleton while loading, muted error fallback. The whole tile is a
 * `<a routerLink>` to the full summary page so the keyboard surface stays
 * one element (Jakob's: links look like links).
 */
@Component({
  selector: 'app-monthly-summary-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, SkeletonModule],
  templateUrl: './monthly-summary-widget.component.html',
  styleUrl: './monthly-summary-widget.component.scss',
})
export class MonthlySummaryWidgetComponent implements OnInit {
  private readonly attendanceService = inject(AttendanceService);
  private readonly academyService = inject(AcademyService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rows = signal<AttendanceSummaryRow[]>([]);
  protected readonly loading = signal<boolean>(true);
  protected readonly errored = signal<boolean>(false);

  protected readonly month = currentYearMonth();

  /** Top 5 by descending count — typical small dojos may have fewer rows total. */
  protected readonly topRows = computed<AttendanceSummaryRow[]>(() =>
    [...this.rows()].sort((a, b) => b.count - a.count).slice(0, 5),
  );

  /** Total training-days across the academy this month. */
  protected readonly totalDays = computed<number>(() =>
    this.rows().reduce((acc, r) => acc + r.count, 0),
  );

  /**
   * Sessions actually held by the academy in the current month (capped at
   * today). Drives the per-row "count / scheduled · pct%" display when the
   * academy has configured `training_days`. `null` when not configured —
   * rows fall back to the bare count display (#88b).
   */
  protected readonly scheduledCount = computed<number | null>(() => {
    const [y, m] = this.month.split('-').map(Number);
    return countScheduledTrainingDays(this.academyService.academy()?.training_days ?? null, y, m);
  });

  /** Per-row whole-percent helper. `null` when the row has no denominator yet. */
  ratePercent(count: number): number | null {
    const r = attendanceRate(count, this.scheduledCount());
    return r === null ? null : Math.round(r * 100);
  }

  protected readonly monthLabel = computed<string>(() => {
    const [y, m] = this.month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  });

  ngOnInit(): void {
    this.attendanceService
      .getMonthlySummary(this.month)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (rows) => {
          this.rows.set(rows);
          this.loading.set(false);
        },
        error: () => {
          this.errored.set(true);
          this.loading.set(false);
        },
      });
  }
}
