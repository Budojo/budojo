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
  private readonly destroyRef = inject(DestroyRef);
  private readonly languageService = inject(LanguageService);

  protected readonly payments = signal<readonly AthletePayment[]>([]);
  protected readonly loading = signal(true);
  protected readonly loadError = signal(false);
  protected readonly noProfile = signal(false);
  protected readonly year = signal(new Date().getFullYear());

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
