import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { ChartModule } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { MonthlyPaymentsBucket, StatsService } from '../../../core/services/stats.service';
import { LanguageService } from '../../../core/services/language.service';
import { localeFor } from '../../../shared/utils/locale';
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
  private readonly languageService = inject(LanguageService);

  protected readonly loading = signal(true);
  protected readonly errored = signal(false);
  protected readonly buckets = signal<readonly MonthlyPaymentsBucket[]>([]);

  protected readonly currency = computed(() => this.buckets()[0]?.currency ?? 'EUR');

  /**
   * Money, written as money (#1549).
   *
   * The chart drew bare floats — hovering a bar gave `17.61`, and the owner's
   * question was the right one: seventeen WHAT? The currency arrives on every
   * bucket and was computed here from the first release, and then never
   * rendered; this is the one line that was missing.
   *
   * `Intl` rather than a hand-rolled `€` prefix: the symbol's side and the
   * decimal separator both move with the language, and Italian writes
   * `2.560,00 €` where English writes `€2,560.00`.
   */
  private readonly money = computed(() => {
    const locale = localeFor(this.languageService.currentLang());
    const currency = this.currency();
    return (value: number): string => value.toLocaleString(locale, { style: 'currency', currency });
  });

  protected readonly isEmpty = computed(() => this.buckets().every((b) => b.amount_cents === 0));

  protected readonly chartData = computed(() => ({
    labels: this.buckets().map((b) => b.month),
    datasets: [
      {
        data: this.buckets().map((b) => b.amount_cents / 100),
        // Primary indigo — uniform with the athletes histogram. Heatmap is
        // intentionally per-month rainbow because the color encodes
        // information; this trend chart is monocolor by design.
        // Literal hex because Chart.js canvas can't resolve var(--*).
        backgroundColor: '#5b6cff',
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
