import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { AthletePayment, PaymentService } from '../../core/services/payment.service';
import { Carnet, CarnetService } from '../../core/services/carnet.service';
import { LanguageService } from '../../core/services/language.service';
import { activeCarnetOf } from '../../shared/utils/active-carnet';
import { localeFor } from '../../shared/utils/locale';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

/**
 * Athlete-portal monthly payments page (M7 PR-D slice 4). Read-only
 * grid of the user's 12-month payment ledger for the selected year.
 *
 * V1 ships the current calendar year only — the wire payload is
 * already keyed on (year, month), so a year switcher is a tiny
 * follow-up if athletes ask for historical visibility. Months
 * without a row are unpaid by definition (the server's contract).
 */
@Component({
  selector: 'app-my-payments',
  standalone: true,
  imports: [PageHeaderComponent, TranslatePipe, DatePipe, SkeletonModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-payments.component.html',
  styleUrl: './my-payments.component.scss',
})
export class MyPaymentsComponent implements OnInit {
  private readonly paymentService = inject(PaymentService);
  private readonly carnetService = inject(CarnetService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly languageService = inject(LanguageService);

  protected readonly payments = signal<readonly AthletePayment[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly noProfile = signal(false);
  protected readonly year = signal(new Date().getFullYear());

  /**
   * The athlete's own carnet balance (#1364) — the answer to "quanti ingressi
   * mi restano", which today they have to ask the instructor.
   *
   * Read-only and balance-only: the consumed-session register lives behind
   * the owner's `payments_read` capability, so the portal shows what
   * `/me/carnets` can answer and nothing it can't. A failure here leaves the
   * card off rather than blocking the payments grid — the monthly ledger is
   * the page's main job.
   */
  protected readonly carnets = signal<readonly Carnet[]>([]);

  /** Same rule as the owner panel and the server — see `activeCarnetOf`. */
  protected readonly activeCarnet = computed<Carnet | null>(() => activeCarnetOf(this.carnets()));

  /**
   * One row per month, 1..12. `payment` is the payment **covering** that
   * month (or null — unpaid), which since #1382 is not the same as the one
   * whose `month` matches: a quarterly bought in February pays for March and
   * April too, and the year listing returns periods that merely touch the
   * year, so a December-2025 quarterly arrives with `month: 12` and would
   * otherwise mark December 2026 paid.
   *
   * Mirrors the owner-side table in `payments-list.component.ts`. `coveredBy
   * EarlierPeriod` is what keeps the amount on one row: repeating €165 down
   * three months would treble what the athlete thinks they paid.
   */
  protected readonly months = computed(() => {
    const year = this.year();
    const byMonth = new Map<number, AthletePayment>();
    for (const p of this.payments()) {
      for (let i = 0; i < (p.period_months ?? 1); i++) {
        const absolute = p.year * 12 + (p.month - 1) + i;
        if (Math.floor(absolute / 12) !== year) continue;
        byMonth.set((absolute % 12) + 1, p);
      }
    }
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const payment = byMonth.get(m) ?? null;
      return {
        month: m,
        payment,
        coveredByEarlierPeriod: payment !== null && !(payment.year === year && payment.month === m),
        periodCaption: payment === null ? null : this.captionFor(payment),
      };
    });
  });

  /**
   * "January – March 2026" for a period longer than a month, `null` for a
   * plain monthly where the row's own label already says everything.
   *
   * Built from `Intl` rather than translation keys because this page names
   * its months through Angular's date pipe, and two sources for the same
   * word is how "gennaio" ends up next to "January".
   */
  private captionFor(payment: AthletePayment): string | null {
    const span = payment.period_months ?? 1;
    if (span <= 1) return null;

    const locale = localeFor(this.languageService.currentLang());
    const startDate = new Date(payment.year, payment.month - 1, 1);
    const endDate = new Date(payment.year, payment.month - 1 + span - 1, 1);
    const name = (d: Date): string => d.toLocaleDateString(locale, { month: 'long' });

    return `${name(startDate)} – ${name(endDate)} ${endDate.getFullYear()}`;
  }

  ngOnInit(): void {
    this.carnetService
      .listMine()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (carnets) => this.carnets.set(carnets ?? []),
        error: () => this.carnets.set([]),
      });

    this.paymentService
      .listMine(this.year())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (payments) => {
          if (payments === null) {
            this.noProfile.set(true);
          } else {
            this.payments.set(payments);
          }
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.loadError.set(true);
        },
      });
  }

  /**
   * Local Date for the 1st of the month — used by DatePipe to render
   * the month label ("January", "February"…). Constructing from
   * year/month parts keeps the label stable across timezones
   * (mirrors the same gotcha addressed in MyAttendance).
   */
  protected localMonthDate(month: number): Date {
    return new Date(this.year(), month - 1, 1);
  }

  /**
   * Locale-aware currency display — mirrors `PaymentsListComponent.formatAmount`
   * (the owner-side payments tab). Reads the SPA's runtime language
   * toggle so the decimal separator matches user expectations
   * (`5,00 €` in IT vs `€5.00` in EN). Copilot review on PR #624.
   */
  protected formatAmount(cents: number): string {
    const locale = localeFor(this.languageService.currentLang());
    return (cents / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR' });
  }

  /**
   * Date-only display for the carnet expiry. Parsed as UTC so a date-only
   * value doesn't slide to the previous day for users west of Greenwich —
   * same treatment as the owner-side panel.
   */
  protected formatDate(iso: string): string {
    const locale = localeFor(this.languageService.currentLang());
    return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  /**
   * Calendar-date-only display for `paid_at` — slices the YYYY-MM-DD
   * prefix from the ISO timestamp instead of piping through `DatePipe`
   * which (a) parses the ISO as UTC and can shift the day, (b) shows
   * the time-of-day which is noise for a payment ledger. Mirrors
   * `PaymentsListComponent.formatPaidAt` (Copilot review on #624).
   */
  protected formatPaidAt(iso: string): string {
    return iso.slice(0, 10);
  }
}
