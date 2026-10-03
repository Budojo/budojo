import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectButtonModule } from 'primeng/selectbutton';
import { SkeletonModule } from 'primeng/skeleton';
import { Athlete } from '../../../../core/services/athlete.service';
import { LanguageService } from '../../../../core/services/language.service';
import { AthletePayment, PaymentMethod } from '../../../../core/services/payment.service';
import { AthleteIdentityComponent } from '../../../../shared/components/athlete-identity/athlete-identity.component';
import { PAYMENT_METHOD_KEYS } from '../../../../shared/utils/i18n-enum-keys';
import { formatCents } from '../../../../shared/utils/money';
import { monthKey } from '../../../../shared/utils/months';
import { paymentMethodOptions } from '../../../../shared/utils/payment-method-options';
import { CheckInMoney } from './check-in-money';
import { monthsCovered, yearMonthOf } from './pay-chip';

/** What the sheet hands back once a payment is recorded. */
export interface PayRecorded {
  readonly athlete: Athlete;
  readonly payment: AthletePayment;
}

/**
 * The payment sheet (#2036, PRD § 6.1), opened from a check-in row's chip.
 *
 * The months owed, oldest first, with the chip's month picked. The amount is
 * the athlete's fee times their period, as the server works it out, and is
 * not editable here: the PC's ledger is where a payment gets adjusted. Cash
 * is picked, because cash is what changes hands at the mat. One button
 * records it, and the check-in offers the undo.
 */
@Component({
  selector: 'app-pay-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    TranslatePipe,
    ButtonModule,
    DialogModule,
    SelectButtonModule,
    SkeletonModule,
    AthleteIdentityComponent,
  ],
  templateUrl: './pay-sheet.component.html',
  styleUrl: './pay-sheet.component.scss',
})
export class PaySheetComponent {
  private readonly money = inject(CheckInMoney);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);

  /** Who is paying; `null` keeps the sheet closed. */
  readonly athlete = input<Athlete | null>(null);
  /** The chip's month, picked when the sheet opens. */
  readonly month = input<string | null>(null);

  readonly closed = output<void>();
  readonly recorded = output<PayRecorded>();
  /** The sheet is gone from the screen: the host can take the keyboard back. */
  readonly hidden = output<void>();

  /** The months owed; `null` while the server is asked. */
  protected readonly months = signal<readonly string[] | null>(null);
  protected readonly picked = signal<string | null>(null);
  protected readonly method = signal<PaymentMethod>('cash');
  protected readonly saving = signal<boolean>(false);
  protected readonly failed = signal<boolean>(false);

  protected readonly methodOptions = computed(() => {
    this.languageService.currentLang();
    return paymentMethodOptions(this.translate);
  });

  private readonly thisYear = new Date().getFullYear();

  /** Which opening an answer belongs to: a late one for a closed sheet is dropped. */
  private opening = 0;

  constructor() {
    // Each opening asks again: a payment made on the PC since the last one
    // is a month this sheet must not offer.
    effect(() => {
      const athlete = this.athlete();
      const month = this.month();
      untracked(() => (athlete === null ? this.reset() : this.open(athlete, month)));
    });
  }

  /** The button's words: «Registra 60,00 € · contanti». */
  protected readonly recordLabel = computed<string>(() => {
    const athlete = this.athlete();
    if (athlete === null) return '';
    const amount = formatCents(
      this.money.amountOf(athlete),
      'EUR',
      this.languageService.currentLang(),
    );
    const method = this.translate.instant(PAYMENT_METHOD_KEYS[this.method()]).toLocaleLowerCase();
    return this.translate.instant('attendance.daily.pay.sheet.record', { amount, method });
  });

  /**
   * One month's words: «settembre», or «settembre – novembre» for a quarterly
   * payer, whose payment covers the months after it too. The year shows only
   * when it is not this one.
   */
  protected monthLabel(month: string): string {
    const athlete = this.athlete();
    const covered = monthsCovered(month, athlete === null ? 1 : this.money.periodOf(athlete));
    const name = (m: string): string => {
      const { year, month: n } = yearMonthOf(m);
      const word = this.translate.instant(monthKey(n));
      return year === this.thisYear ? word : `${word} ${year}`;
    };
    const first = covered[0];
    const last = covered[covered.length - 1];
    return first === last ? name(first) : `${name(first)} – ${name(last)}`;
  }

  protected pick(month: string): void {
    this.picked.set(month);
  }

  protected onVisibleChange(visible: boolean): void {
    if (!visible) this.closed.emit();
  }

  protected submit(): void {
    const athlete = this.athlete();
    const month = this.picked();
    if (athlete === null || month === null || this.saving()) return;
    this.saving.set(true);
    this.failed.set(false);
    this.money.record(athlete, month, this.method()).subscribe({
      next: (payment) => {
        this.saving.set(false);
        this.recorded.emit({ athlete, payment });
      },
      error: () => {
        this.saving.set(false);
        this.failed.set(true);
      },
    });
  }

  private open(athlete: Athlete, chipMonth: string | null): void {
    this.reset();
    const opening = this.opening;
    this.money.owedFor(athlete).subscribe({
      next: (months) => {
        if (opening === this.opening) this.settle(months, chipMonth);
      },
      // The chip's own month is still worth offering: the server will say
      // if it is not owed any more.
      error: () => {
        if (opening === this.opening) this.settle(chipMonth === null ? [] : [chipMonth], chipMonth);
      },
    });
  }

  private settle(months: readonly string[], chipMonth: string | null): void {
    this.months.set(months);
    this.picked.set(
      chipMonth !== null && months.includes(chipMonth) ? chipMonth : (months[0] ?? null),
    );
  }

  private reset(): void {
    this.opening++;
    this.months.set(null);
    this.picked.set(null);
    this.method.set('cash');
    this.saving.set(false);
    this.failed.set(false);
  }
}
