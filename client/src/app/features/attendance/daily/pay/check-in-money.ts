import { Injectable, inject, signal } from '@angular/core';
import { Observable, forkJoin, map, of, tap } from 'rxjs';
import { Athlete } from '../../../../core/services/athlete.service';
import {
  AthletePayment,
  PaymentMethod,
  PaymentService,
  RecordedPayment,
} from '../../../../core/services/payment.service';
import { StatsService } from '../../../../core/services/stats.service';
import { MoneyRows, moneyRows } from './money-rows';
import {
  PayChip,
  monthOf,
  monthsCovered,
  owedMonths,
  payChipOf,
  periodStarts,
  yearMonthOf,
} from './pay-chip';

/**
 * The money side of the phone's check-in (#2036): who owes what, and the
 * payments this screen records. Provided by the check-in, so it lives and
 * dies with the screen.
 *
 * Everything it knows comes from the phone's own server: the roster's
 * coverage, the arrears list (`GET /stats/payments/arrears`) and, once a
 * sheet opens, that athlete's own overdue months. Payments made here are kept
 * beside them, because the roster's coverage was read before they existed.
 */
@Injectable()
export class CheckInMoney {
  private readonly stats = inject(StatsService);
  private readonly payments = inject(PaymentService);

  /** The month the check-in is in, read when the screen opens. */
  private readonly thisMonth = signal<string>(monthOf(new Date()));

  /**
   * The months each athlete is behind, oldest first, from the arrears list. A
   * sheet that opened asks again for that athlete and replaces them.
   */
  private readonly behind = signal<ReadonlyMap<number, readonly string[]>>(new Map());

  /** The months paid on this screen since it opened, per athlete. */
  private readonly paidHere = signal<ReadonlyMap<number, ReadonlySet<string>>>(new Map());

  /** True once the arrears list answered, or failed: chips wait for it. */
  readonly ready = signal<boolean>(false);

  /** Ask the server who is behind. A failure leaves only this month's state. */
  load(): void {
    this.thisMonth.set(monthOf(new Date()));
    this.stats.paymentsArrears().subscribe({
      next: (rows) => {
        this.behind.set(new Map(rows.map((row) => [row.athlete.id, row.unpaid_months])));
        this.ready.set(true);
      },
      error: () => this.ready.set(true),
    });
  }

  /** The chip for one athlete, or null before the arrears answered. */
  chipFor(athlete: Athlete): PayChip | null {
    if (!this.ready()) return null;
    return payChipOf(
      athlete,
      this.behind().get(athlete.id) ?? [],
      this.thisMonth(),
      this.paidHere().get(athlete.id) ?? new Set(),
    );
  }

  /**
   * Who still has to pay among `athletes` (#2132), tonight's people first,
   * or null before the arrears answered: «Soldi» lists whoever the chip
   * would ask.
   */
  whoOwes(athletes: readonly Athlete[], presentToday: ReadonlySet<number>): MoneyRows | null {
    if (!this.ready()) return null;
    return moneyRows(athletes, this.behind(), this.thisMonth(), this.paidHere(), presentToday);
  }

  /** How many months one payment covers for this athlete (#1382). */
  periodOf(athlete: Athlete): number {
    return athlete.billing_period_months ?? 1;
  }

  /** What one payment costs this athlete: their fee times their period. */
  amountOf(athlete: Athlete): number {
    return (athlete.monthly_fee_cents ?? 0) * this.periodOf(athlete);
  }

  /**
   * The payments this athlete owes, oldest first, each as the month its
   * period starts on. The months behind are asked of the server per year,
   * from the first month the arrears list names to this year, and the answer
   * replaces the arrears list's single month for them.
   */
  owedFor(athlete: Athlete): Observable<string[]> {
    const thisYear = yearMonthOf(this.thisMonth()).year;
    const first = this.behind().get(athlete.id)?.[0];
    const fromYear = first === undefined ? thisYear : Math.min(yearMonthOf(first).year, thisYear);
    const years = Array.from({ length: thisYear - fromYear + 1 }, (_, i) => fromYear + i);
    const asked: Observable<(readonly string[])[]> =
      first === undefined ? of([]) : forkJoin(years.map((year) => this.overdueIn(athlete, year)));
    return asked.pipe(
      map((perYear) => perYear.flat()),
      tap((months) => this.setBehind(athlete.id, months)),
      map((months) =>
        periodStarts(
          owedMonths(
            athlete,
            months,
            this.thisMonth(),
            this.paidHere().get(athlete.id) ?? new Set(),
          ),
          this.periodOf(athlete),
        ),
      ),
    );
  }

  /**
   * Record one payment for `month`, today, by `method`. A row the server
   * already held comes back with `created: false`: paid, but not this
   * screen's to undo.
   */
  record(athlete: Athlete, month: string, method: PaymentMethod): Observable<RecordedPayment> {
    const { year, month: m } = yearMonthOf(month);
    return this.payments
      .record(athlete.id, year, m, this.periodOf(athlete), { method })
      .pipe(
        tap(({ payment }) =>
          this.markHere(athlete.id, monthsCovered(month, payment.period_months ?? 1), true),
        ),
      );
  }

  /** Take back a payment this screen recorded. */
  undo(athlete: Athlete, payment: AthletePayment): Observable<void> {
    const month = `${payment.year}-${String(payment.month).padStart(2, '0')}`;
    return this.payments
      .unmarkPaid(athlete.id, payment.year, payment.month)
      .pipe(
        tap(() =>
          this.markHere(athlete.id, monthsCovered(month, payment.period_months ?? 1), false),
        ),
      );
  }

  private overdueIn(athlete: Athlete, year: number): Observable<readonly string[]> {
    return this.payments.list(athlete.id, year).pipe(map((answer) => answer.overdueMonths));
  }

  private setBehind(athleteId: number, months: readonly string[]): void {
    const next = new Map(this.behind());
    next.set(athleteId, [...months].sort());
    this.behind.set(next);
  }

  private markHere(athleteId: number, months: readonly string[], paid: boolean): void {
    const next = new Map(this.paidHere());
    const set = new Set(next.get(athleteId) ?? []);
    for (const month of months) {
      if (paid) set.add(month);
      else set.delete(month);
    }
    next.set(athleteId, set);
    this.paidHere.set(next);
  }
}
