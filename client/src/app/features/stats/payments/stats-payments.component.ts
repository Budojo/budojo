import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { ChartModule } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { MonthlyPaymentsBucket, StatsService } from '../../../core/services/stats.service';
import { LanguageService } from '../../../core/services/language.service';
import { formatMoney } from '../../../shared/utils/money';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaymentsArrearsComponent } from './arrears/payments-arrears.component';
import { PaymentsSummaryComponent } from './summary/payments-summary.component';

@Component({
  selector: 'app-stats-payments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ChartModule,
    SkeletonModule,
    TranslatePipe,
    ErrorStateComponent,
    EmptyStateComponent,
    PaymentsArrearsComponent,
    PaymentsSummaryComponent,
  ],
  templateUrl: './stats-payments.component.html',
  styleUrl: './stats-payments.component.scss',
})
export class StatsPaymentsComponent {
  private readonly stats = inject(StatsService);
  private readonly languageService = inject(LanguageService);

  protected readonly loading = signal(true);
  protected readonly errored = signal(false);
  protected readonly buckets = signal<readonly MonthlyPaymentsBucket[]>([]);

  protected readonly currency = computed(() => this.buckets()[0]?.currency ?? 'EUR');

  /**
   * Money, written as money (#1549): the chart drew bare floats, and the
   * owner's question was the right one — seventeen WHAT? One formatter for
   * the whole page (#1759), so the bars, the month's tiles and the arrears
   * list write the same sum the same way.
   */
  private readonly money = computed(() => {
    const lang = this.languageService.currentLang();
    const currency = this.currency();
    return (value: number): string => formatMoney(value, currency, lang);
  });

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

  /**
   * A computed, not a constant: the formatter it closes over follows the
   * language, so the axis has to be rebuilt when the language changes.
   *
   * `precision: 0` is gone with it. It forced whole-number gridlines onto an
   * axis measuring money, so a month worth €17.61 drew its bar between two
   * ticks that could not describe it — and on an academy taking thousands the
   * ticks were integers of euros, which is right by accident rather than by
   * decision. The currency formatter settles the decimals now.
   */
  protected readonly chartOptions = computed(() => {
    const money = this.money();

    return {
      // Fill the 20rem wrap: left at its default 2:1 the canvas runs past it,
      // onto the arrears list below (#1760).
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: { parsed: { y: number } }) => money(ctx.parsed.y),
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value: number | string) => money(Number(value)),
          },
        },
      },
    };
  });

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
