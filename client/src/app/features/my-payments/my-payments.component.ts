import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { SkeletonModule } from 'primeng/skeleton';
import { AthletePayment, PaymentService } from '../../core/services/payment.service';

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
  imports: [TranslatePipe, DatePipe, DecimalPipe, SkeletonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-payments.component.html',
  styleUrl: './my-payments.component.scss',
})
export class MyPaymentsComponent implements OnInit {
  private readonly paymentService = inject(PaymentService);
  private readonly destroyRef = inject(DestroyRef);

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
}
