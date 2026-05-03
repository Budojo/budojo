import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { ChartModule } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { StatsService, MonthlyAttendanceBucket } from '../../../core/services/stats.service';

// Per-month categorical color palette — one entry per calendar month (Jan → Dec).
// Inline hex is intentional: Chart.js resolves backgroundColor values as CSS
// strings but does NOT call getComputedStyle on them when set as dataset-level
// arrays, so `var(--p-*)` tokens would be passed verbatim to the canvas API and
// render as transparent. These are a fixed categorical palette, not theme tokens
// — seasonal hues chosen for readability, not brand alignment.
const MONTH_COLORS: readonly string[] = [
  '#5b6cff', // Jan — primary blue
  '#7c4dff', // Feb — violet
  '#26a69a', // Mar — teal
  '#66bb6a', // Apr — green
  '#9ccc65', // May — lime
  '#ffca28', // Jun — amber
  '#ffa726', // Jul — orange
  '#ef5350', // Aug — red
  '#ec407a', // Sep — pink
  '#ab47bc', // Oct — purple
  '#5c6bc0', // Nov — indigo
  '#42a5f5', // Dec — light blue
] as const;

@Component({
  selector: 'app-stats-attendance',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartModule, SkeletonModule, TranslatePipe],
  templateUrl: './stats-attendance.component.html',
  styleUrl: './stats-attendance.component.scss',
})
export class StatsAttendanceComponent {
  private readonly stats = inject(StatsService);

  protected readonly loading = signal(true);
  protected readonly errored = signal(false);
  protected readonly buckets = signal<readonly MonthlyAttendanceBucket[]>([]);

  protected readonly isEmpty = computed(() => this.buckets().every((b) => b.training_days === 0));

  /**
   * Single-series bar chart. Each bar shows the average attendance per
   * training day for that calendar month: attendance_count / training_days.
   * When training_days === 0 (gym closed / no data), the bar height is 0
   * so the month label still appears on the X axis.
   *
   * Each bar is coloured by its calendar month index (0-based) so the chart
   * is visually richer without needing a legend.
   */
  protected readonly chartData = computed(() => {
    const buckets = this.buckets();
    const data = buckets.map((b) => {
      const avg = b.training_days > 0 ? b.attendance_count / b.training_days : 0;
      return Math.round(avg * 10) / 10;
    });
    const backgroundColor = buckets.map((b) => MONTH_COLORS[Number(b.month.split('-')[1]) - 1]);
    return {
      labels: buckets.map((b) => b.month),
      datasets: [{ data, backgroundColor }],
    };
  });

  protected readonly chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { beginAtZero: true },
      y: { beginAtZero: true, ticks: { precision: 1 } },
    },
  } as const;

  constructor() {
    this.stats
      .attendanceMonthly()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (buckets) => {
          this.buckets.set(buckets);
          this.loading.set(false);
        },
        error: () => {
          this.errored.set(true);
          this.loading.set(false);
        },
      });
  }
}
