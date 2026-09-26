import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { SkeletonModule } from 'primeng/skeleton';
import { ArrearsRow, StatsService } from '../../../../core/services/stats.service';
import { LanguageService } from '../../../../core/services/language.service';
import { localeFor } from '../../../../shared/utils/locale';
import { AthleteIdentityComponent } from '../../../../shared/components/athlete-identity/athlete-identity.component';
import { ErrorStateComponent } from '../../../../shared/components/error-state/error-state.component';

/**
 * Who is behind, since when, and by how much (#1760).
 *
 * The unpaid chip answers "who has not paid **this** month"; nothing answered
 * "who has been behind since July". Each row says how long, since when and
 * roughly how much, and opens the athlete on their payments, where the months
 * are settled one by one.
 *
 * The amount is **an estimate** — the fee today, times the months — and the
 * page says so rather than printing a figure that looks exact. So does the
 * one case the server cannot see: someone who left and came back.
 */
@Component({
  selector: 'app-payments-arrears',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, SkeletonModule, AthleteIdentityComponent, ErrorStateComponent],
  templateUrl: './payments-arrears.component.html',
  styleUrl: './payments-arrears.component.scss',
})
export class PaymentsArrearsComponent {
  private readonly stats = inject(StatsService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly errored = signal(false);
  protected readonly rows = signal<readonly ArrearsRow[]>([]);

  constructor() {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.errored.set(false);
    const sub = this.stats.paymentsArrears().subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: () => {
        this.errored.set(true);
        this.loading.set(false);
      },
    });
    this.destroyRef.onDestroy(() => sub.unsubscribe());
  }

  /** "3 athletes · €275.00 estimated" — the whole list in one line. */
  protected readonly total = computed(() => {
    this.languageService.currentLang(); // signal dep — re-translate on toggle
    const rows = this.rows();
    const owed = rows.reduce((sum, row) => sum + row.owed_cents, 0);
    return this.translate.instant(
      rows.length === 1 ? 'stats.payments.arrears.totalOne' : 'stats.payments.arrears.totalOther',
      { count: rows.length, amount: this.money(owed) },
    );
  });

  /** "4 months · since March 2026". */
  protected behind(row: ArrearsRow): string {
    this.languageService.currentLang();
    const months = this.translate.instant(
      row.months_behind === 1
        ? 'stats.payments.arrears.monthsBehindOne'
        : 'stats.payments.arrears.monthsBehindOther',
      { count: row.months_behind },
    );
    const since = this.translate.instant('stats.payments.arrears.since', {
      month: this.monthName(row.first_unpaid),
    });
    return `${months} · ${since}`;
  }

  protected money(cents: number): string {
    const locale = localeFor(this.languageService.currentLang());
    return (cents / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR' });
  }

  /**
   * `2026-03` as "March 2026", built from its numbers in local time — parsing
   * the string as a date would read it as UTC midnight and, west of
   * Greenwich, name February.
   */
  private monthName(yearMonth: string): string {
    const [year, month] = yearMonth.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString(
      localeFor(this.languageService.currentLang()),
      { month: 'long', year: 'numeric' },
    );
  }
}
