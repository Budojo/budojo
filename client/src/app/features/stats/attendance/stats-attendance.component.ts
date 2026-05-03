import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ChartModule } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { LanguageService } from '../../../core/services/language.service';
import { StatsService, MonthlyAttendanceBucket } from '../../../core/services/stats.service';

interface BarData {
  readonly labels: readonly string[];
  readonly datasets: readonly {
    readonly label: string;
    readonly data: readonly number[];
    readonly backgroundColor: string;
    readonly stack: 'attendance';
  }[];
}

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
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  protected readonly loading = signal(true);
  protected readonly errored = signal(false);
  protected readonly buckets = signal<readonly MonthlyAttendanceBucket[]>([]);

  protected readonly isEmpty = computed(() =>
    this.buckets().every((b) => b.active === 0 && b.paused === 0),
  );

  /**
   * Reactive against language toggle so legend labels re-render in
   * the active locale without a manual subscription.
   */
  protected readonly chartData = computed<BarData>(() => {
    this.languageService.currentLang(); // signal dep
    const buckets = this.buckets();
    return {
      labels: buckets.map((b) => b.month),
      datasets: [
        {
          label: this.translate.instant('stats.attendance.active'),
          data: buckets.map((b) => b.active),
          backgroundColor: 'var(--p-primary-color)',
          stack: 'attendance' as const,
        },
        {
          label: this.translate.instant('stats.attendance.paused'),
          data: buckets.map((b) => b.paused),
          backgroundColor: 'var(--p-surface-300)',
          stack: 'attendance' as const,
        },
      ],
    };
  });

  protected readonly chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' as const } },
    scales: {
      x: { stacked: true },
      y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
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
