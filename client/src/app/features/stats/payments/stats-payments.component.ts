import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { ChartModule } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { MonthlyPaymentsBucket, StatsService } from '../../../core/services/stats.service';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-stats-payments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartModule, SkeletonModule, TranslatePipe, ErrorStateComponent, EmptyStateComponent],
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
        // Primary indigo, one colour for the series — the bars differ by
        // height, which is the whole point of a trend chart.
        //
        // Except the months past today (#1553): the window reaches forward to
        // the last month already paid for, and a bar for November drawn in
        // September is a different kind of fact from the ones behind it.
        // Same hue at a third of the strength, so it reads as the same series
        // seen through glass rather than as a second one.
        // Literal hex because Chart.js canvas can't resolve var(--*).
        backgroundColor: this.buckets().map((b) => (b.future ? '#5b6cff55' : '#5b6cff')),
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
