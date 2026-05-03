import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { ChartModule } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { MonthlyPaymentsBucket, StatsService } from '../../../core/services/stats.service';

@Component({
  selector: 'app-stats-payments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartModule, SkeletonModule, TranslatePipe],
  templateUrl: './stats-payments.component.html',
  styleUrl: './stats-payments.component.scss',
})
export class StatsPaymentsComponent {
  private readonly stats = inject(StatsService);

  protected readonly loading = signal(true);
  protected readonly errored = signal(false);
  protected readonly buckets = signal<readonly MonthlyPaymentsBucket[]>([]);

  protected readonly currency = computed(() => this.buckets()[0]?.currency ?? 'EUR');

  protected readonly isEmpty = computed(() => this.buckets().every((b) => b.amount_cents === 0));

  protected readonly chartData = computed(() => ({
    labels: this.buckets().map((b) => b.month),
    datasets: [
      {
        data: this.buckets().map((b) => b.amount_cents / 100),
        // Primary indigo — uniform with the athletes histogram. Heatmap is
        // intentionally per-month rainbow because there color encodes
        // information; this trend chart is monocolor by design.
        // Literal hex because Chart.js canvas can't resolve var(--*).
        backgroundColor: '#5b6cff',
      },
    ],
  }));

  protected readonly chartOptions = {
    plugins: { legend: { display: false } },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { precision: 0 },
      },
    },
  } as const;

  constructor() {
    this.stats
      .paymentsMonthly()
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
