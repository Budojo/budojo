import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import { MenuItem, MessageService } from 'primeng/api';
import { ChartModule } from 'primeng/chart';
import { SkeletonModule } from 'primeng/skeleton';
import { SplitButtonModule } from 'primeng/splitbutton';
import { AcademyService } from '../../../core/services/academy.service';
import { triggerBrowserDownload } from '../../../shared/utils/download';
import { MonthlyPaymentsBucket, StatsService } from '../../../core/services/stats.service';
import { LanguageService } from '../../../core/services/language.service';
import { localeFor } from '../../../shared/utils/locale';
import { ErrorStateComponent } from '../../../shared/components/error-state/error-state.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { PaymentsArrearsComponent } from './arrears/payments-arrears.component';

/** A season the accountant's file can be asked for: the year it starts in, and its name. */
interface ExportSeason {
  readonly startYear: number;
  readonly label: string;
}

/**
 * The season before `current`, named the way the server names seasons:
 * `2025/26` for one that crosses new year, `2025` for a calendar-year academy.
 */
function previousSeason(current: ExportSeason): ExportSeason {
  const startYear = current.startYear - 1;
  const label = current.label.includes('/')
    ? `${startYear}/${String(startYear + 1).slice(-2)}`
    : String(startYear);
  return { startYear, label };
}

@Component({
  selector: 'app-stats-payments',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ChartModule,
    SkeletonModule,
    SplitButtonModule,
    TranslatePipe,
    ErrorStateComponent,
    EmptyStateComponent,
    PaymentsArrearsComponent,
  ],
  templateUrl: './stats-payments.component.html',
  styleUrl: './stats-payments.component.scss',
})
export class StatsPaymentsComponent {
  private readonly stats = inject(StatsService);
  private readonly languageService = inject(LanguageService);
  private readonly academyService = inject(AcademyService);
  private readonly translate = inject(TranslateService);
  private readonly messages = inject(MessageService);

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

  /**
   * The seasons the accountant's file can be asked for (#1762): the one the
   * academy is in, as the server reports it for today, and the one before —
   * in September the current season has barely begun, and the finished one
   * is the file the accountant is asking for. Nothing until the academy has
   * said which season it is in.
   */
  protected readonly exportSeasons = computed<readonly ExportSeason[]>(() => {
    const academy = this.academyService.academy();
    if (!academy?.season_start || !academy.season_label) return [];

    const current = {
      startYear: Number(academy.season_start.slice(0, 4)),
      label: academy.season_label,
    };
    return [current, previousSeason(current)];
  });

  /** One menu entry per season, in the language on screen. */
  protected readonly seasonItems = computed<MenuItem[]>(() => {
    this.languageService.currentLang();
    return this.exportSeasons().map((season) => ({
      label: this.translate.instant('stats.payments.export.season', { label: season.label }),
      command: () => this.exportSeason(season),
    }));
  });

  protected readonly exporting = signal(false);

  /**
   * Download one season as the accountant's CSV. The file is named after the
   * season here rather than read from the response: it is the same name the
   * server sends, and reading `Content-Disposition` off a blob would need the
   * header exposed for nothing.
   */
  protected exportSeason(season: ExportSeason): void {
    if (this.exporting()) return;

    this.exporting.set(true);
    this.stats
      .paymentsExport(season.startYear)
      .pipe(finalize(() => this.exporting.set(false)))
      .subscribe({
        next: (blob) =>
          triggerBrowserDownload(blob, `budojo-payments-${season.label.replace('/', '-')}.csv`),
        error: () =>
          this.messages.add({
            severity: 'error',
            summary: this.translate.instant('stats.payments.export.errorSummary'),
            detail: this.translate.instant('stats.payments.export.errorDetail'),
            life: 5000,
          }),
      });
  }

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
