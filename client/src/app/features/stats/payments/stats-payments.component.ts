import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { ChartModule } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { MonthlyPaymentsBucket, StatsService } from '../../../core/services/stats.service';

// Inline hex literals — Chart.js's options object can't resolve `var(--p-*)` tokens,
// and these colors are categorical (one per calendar month) rather than theme tokens.
const MONTH_COLORS: readonly string[] = [
  '#5b6cff',
  '#7c4dff',
  '#26a69a',
  '#66bb6a',
  '#9ccc65',
  '#ffca28',
  '#ffa726',
  '#ef5350',
  '#ec407a',
  '#ab47bc',
  '#5c6bc0',
  '#42a5f5',
];

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
        backgroundColor: this.buckets().map((b) => MONTH_COLORS[Number(b.month.split('-')[1]) - 1]),
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
