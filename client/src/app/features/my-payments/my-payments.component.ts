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
import { AthletePayment, PaymentService } from '../../core/services/payment.service';
import { Carnet, CarnetService } from '../../core/services/carnet.service';
import { LanguageService } from '../../core/services/language.service';
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
  imports: [PageHeaderComponent, TranslatePipe, DatePipe, SkeletonModule],
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

  /** Same rule as everywhere else: the one the next session will spend. */
  protected readonly activeCarnet = computed<Carnet | null>(() => {
    const spendable = this.carnets().filter((c) => c.is_active);
    return (
      [...spendable].sort((a, b) => a.expires_at.localeCompare(b.expires_at) || a.id - b.id)[0] ??
      null
    );
  });

  /**
   * One row per month, 1..12. `payment` is the matched row (or null
   * — unpaid). Keeps the template a clean grid render without any
   * "find this month in the array" logic per cell.
   */
  protected readonly months = computed(() => {
    const byMonth = new Map<number, AthletePayment>();
    for (const p of this.payments()) {
      byMonth.set(p.month, p);
    }
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      return { month: m, payment: byMonth.get(m) ?? null };
    });
  });

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
