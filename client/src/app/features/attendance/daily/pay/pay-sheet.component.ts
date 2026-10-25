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
import { holdDialogWhile } from '../../../../shared/utils/dialog-hold';
import { formatCents } from '../../../../shared/utils/money';
import { monthKey } from '../../../../shared/utils/months';
import { paymentMethodOptions } from '../../../../shared/utils/payment-method-options';
import { MatMoney } from './mat-money';
import { PayOption, monthsCovered, yearMonthOf } from './pay-chip';

/** What the sheet hands back once a payment is recorded. */
export interface PayRecorded {
  readonly athlete: Athlete;
  readonly payment: AthletePayment;
  /** False when the server already held it: nothing for this screen to undo. */
  readonly created: boolean;
}

/**
 * The payment sheet (#2036, PRD § 6.1), opened from a check-in row's chip or
 * a row of «Soldi» (#2132).
 *
 * The months owed, oldest first, with the host's month picked. The amount is
 * the athlete's fee times the picked payment's period (their own, or one
 * month where a whole period would cross one paid, #2150), and is not
 * editable here: the PC's ledger is where a payment gets adjusted. Cash
 * is picked, because cash is what changes hands at the mat. One button
 * records it, and the host offers the undo.
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
  private readonly money = inject(MatMoney);
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

  /** The payments owed, each a month and its period; `null` while the server is asked. */
  protected readonly months = signal<readonly PayOption[] | null>(null);
  /** The month of the payment picked. */
  protected readonly picked = signal<string | null>(null);

  /** The picked payment, with its period: a single month where a quarter would cross a paid one. */
  private readonly pickedOption = computed<PayOption | null>(
    () => this.months()?.find((option) => option.month === this.picked()) ?? null,
  );
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

    // While a payment is on its way the sheet stays: Escape and the mask
    // are held (#2133 review). The ✕ hides on its own.
    holdDialogWhile(() => this.saving(), 'pay-sheet-dialog');
  }

  /** The button's words: «Registra 60,00 € · contanti». */
  protected readonly recordLabel = computed<string>(() => {
    const athlete = this.athlete();
    if (athlete === null) return '';
    const amount = formatCents(
      this.money.amountOf(athlete, this.pickedOption()?.period),
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
  protected monthLabel(option: PayOption): string {
    const covered = monthsCovered(option.month, option.period);
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
    const option = this.pickedOption();
    if (athlete === null || option === null || this.saving()) return;
    this.saving.set(true);
    this.failed.set(false);
    this.money.record(athlete, option, this.method()).subscribe({
      next: ({ payment, created }) => {
        this.saving.set(false);
        this.recorded.emit({ athlete, payment, created });
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
        if (opening !== this.opening) return;
        const period = this.money.periodOf(athlete);
        this.settle(chipMonth === null ? [] : [{ month: chipMonth, period }], chipMonth);
      },
    });
  }

  private settle(options: readonly PayOption[], chipMonth: string | null): void {
    this.months.set(options);
    const chip = options.find((option) => option.month === chipMonth);
    this.picked.set(chip?.month ?? options[0]?.month ?? null);
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
