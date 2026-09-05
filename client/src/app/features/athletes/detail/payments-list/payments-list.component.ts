import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { finalize, map } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmPopup } from 'primeng/confirmpopup';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { Tooltip } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AthleteService } from '../../../../core/services/athlete.service';
import { LanguageService } from '../../../../core/services/language.service';
import { FeeTier } from '../../../../core/services/fee-tier.service';
import { AthletePayment, PaymentService } from '../../../../core/services/payment.service';
import { localeFor } from '../../../../shared/utils/locale';
import { CarnetPanelComponent } from '../carnet-panel/carnet-panel.component';

/**
 * Per-athlete payments tab on the detail page (#182 Surface 2).
 * Renders a 12-row table of the current calendar year, one row per
 * month, showing whether a payment row exists. Inline "Mark paid" /
 * "Unmark paid" buttons let the coach record back-payments and undo
 * mistakes — the same write path as the athletes-list inline toggle
 * (Surface 1), differs only in that here every month is reachable,
 * not just "this month".
 *
 * **Why current year only.** A coach sometimes wants to see "did
 * Mario pay all 12 months in 2026?" — the year-by-year table
 * answers that. Multi-year navigation (a year selector) is a
 * v2 feature; today the page lists only `getUTCFullYear()`.
 *
 * UTC alignment with Surface 1: same `getUTCFullYear()` /
 * `getUTCMonth()` arithmetic so the badge state and the persisted
 * row stay in sync across the day/month boundary.
 *
 * Future months are listed but their action buttons are disabled —
 * there's nothing to "mark paid" for July 2026 in May.
 */

interface MonthRow {
  readonly month: number;
  readonly labelKey: string;
  /** The payment covering this month, whichever month its period started in. */
  readonly payment: AthletePayment | null;
  readonly canEdit: boolean;
  /**
   * True when this month is covered by a period that started somewhere else
   * (#1382). The row still reads "paid", but the amount belongs to the month
   * the period started in — repeating €165 on all three months of a quarterly
   * would treble the year's takings on a table people read as a ledger.
   */
  readonly coveredByEarlierPeriod: boolean;
  /** How long the covering period is, for the row's "Feb-Apr" caption. */
  readonly periodMonths: number;
}

@Component({
  selector: 'app-payments-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
    CarnetPanelComponent,
    ButtonModule,
    ConfirmPopup,
    SkeletonModule,
    TableModule,
    TagModule,
    ToastModule,
    Tooltip,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './payments-list.component.html',
  styleUrl: './payments-list.component.scss',
})
export class PaymentsListComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly paymentService = inject(PaymentService);
  private readonly athleteService = inject(AthleteService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
  private readonly languageService = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly athleteId = signal<number | null>(null);
  protected readonly athleteName = signal<string>('');
  protected readonly loading = signal<boolean>(true);
  protected readonly payments = signal<readonly AthletePayment[]>([]);

  // Current UTC year/month — fixed at component construction so the
  // table doesn't tick over while the user has it open. A page reload
  // pulls fresh values; the cost of staleness for a tab visit is
  // bounded by the user's session.
  private readonly nowUtc = new Date();
  protected readonly year = this.nowUtc.getUTCFullYear();
  private readonly currentMonth = this.nowUtc.getUTCMonth() + 1;

  /**
   * What this athlete pays each month, resolved server-side (#1381): their
   * price tier if they are on one, the academy's flat fee otherwise.
   *
   * Three states, and the third one matters: `undefined` means the athlete
   * request has not answered yet, `null` means no fee applies, a number is
   * the amount. Collapsing "not known yet" into "no fee" would paint "this
   * academy has not configured a monthly fee" for the fraction of a second
   * before the athlete lands — a claim, not a loading state — and would
   * leave the table permanently read-only when that request fails.
   */
  protected readonly athleteFeeCents = signal<number | null | undefined>(undefined);

  /** The tier they are on, or null when they are on the academy's flat fee. */
  protected readonly feeTier = signal<FeeTier | null>(null);

  /**
   * How many months this athlete's payments cover (#1382). Read from the
   * athlete rather than chosen at the click, so the confirmation can say what
   * the click will actually record. `1` until they load, which is what the
   * table did before periods existed.
   */
  protected readonly athleteBillingPeriod = signal<number>(1);

  /**
   * When no fee applies to this athlete the page renders the table read-only
   * (no buttons): the user is told upfront, no surprising 422 toast.
   *
   * Read from the athlete rather than from the cached academy since #1381 —
   * an academy that prices only by tier has no flat fee, and gating on that
   * would lock the buttons for athletes who plainly do have a fee.
   */
  protected readonly hasMonthlyFee = computed(() => this.athleteFeeCents() !== null);

  /** False until the athlete request answers — see `athleteFeeCents`. */
  protected readonly feeKnown = computed(() => this.athleteFeeCents() !== undefined);

  /**
   * Pre-built 12-row view-model — joins the loaded payments with
   * January…December. Stable order, OnPush-friendly (re-runs only
   * when `payments` or `hasMonthlyFee` changes).
   */
  protected readonly monthRows = computed<MonthRow[]>(() => {
    // A payment covers a period now (#1382), so a month is not a key into the
    // payment list any more — each payment is spread across the cells it pays
    // for, including the ones in a different year at either end.
    const byMonth = new Map<number, AthletePayment>();
    for (const p of this.payments()) {
      for (let i = 0; i < (p.period_months ?? 1); i++) {
        const absolute = p.year * 12 + (p.month - 1) + i;
        if (Math.floor(absolute / 12) !== this.year) continue;
        byMonth.set((absolute % 12) + 1, p);
      }
    }

    const fee = this.hasMonthlyFee();
    return MONTH_KEYS.map((labelKey, i) => {
      const month = i + 1;
      const payment = byMonth.get(month) ?? null;
      // Future months can't be paid (the month hasn't happened); past
      // and current months can. Read-only when no monthly fee is
      // configured at all — there's nothing to record. While the fee is
      // still unknown the buttons stay live: a click that really has no
      // fee behind it gets the server's 422 and its toast, which is a
      // better trade than flickering the whole table read-only on
      // every visit.
      const canEdit = fee && month <= this.currentMonth;
      return {
        month,
        labelKey,
        payment,
        canEdit,
        coveredByEarlierPeriod:
          payment !== null && !(payment.year === this.year && payment.month === month),
        periodMonths: payment?.period_months ?? 1,
      };
    });
  });

  ngOnInit(): void {
    const parentParams = this.route.parent?.paramMap;
    if (!parentParams) return;

    parentParams.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((paramMap) => {
      const idParam = paramMap.get('id');
      if (!idParam) return;
      const id = Number(idParam);
      if (!Number.isFinite(id)) return;
      this.athleteId.set(id);
      this.loadAthleteName(id);
      this.load(id);
    });
  }

  /**
   * Click handler for the per-row Mark/Unmark button. Builds the
   * confirm message, anchors the popup on the clicked button, then
   * dispatches to the PaymentService on accept. Mirrors the Surface 1
   * `confirmTogglePaid` flow; differs only in that the (year, month)
   * is the row's own coordinates, not "current".
   */
  confirmToggleRow(event: MouseEvent, row: MonthRow): void {
    if (!row.canEdit || this.athleteId() === null) return;

    const willMarkPaid = row.payment === null;
    const fullName =
      this.athleteName() || this.translate.instant('athletes.detail.payments.fallbackName');

    // Say what the click actually does (#1382). Marking April paid on an
    // athlete billed quarterly records February through April, and undoing it
    // from April removes the whole quarter — neither is what "April" alone
    // suggests, and Norman's rule is to show the consequence before the act,
    // not after.
    const period = willMarkPaid
      ? this.periodCaptionFor(this.year, row.month, this.athleteBillingPeriod())
      : this.periodCaption(row);

    const message =
      period !== null
        ? this.translate.instant(
            willMarkPaid
              ? 'athletes.detail.payments.confirm.markPaidPeriodMessage'
              : 'athletes.detail.payments.confirm.markUnpaidPeriodMessage',
            { name: fullName, period },
          )
        : this.translate.instant(
            willMarkPaid
              ? 'athletes.detail.payments.confirm.markPaidMessage'
              : 'athletes.detail.payments.confirm.markUnpaidMessage',
            { name: fullName, month: this.translate.instant(row.labelKey), year: this.year },
          );

    this.confirmationService.confirm({
      target: event.currentTarget as EventTarget,
      message,
      accept: () => this.applyToggle(row.month, willMarkPaid),
    });
  }

  private applyToggle(month: number, markPaid: boolean): void {
    const id = this.athleteId();
    if (id === null) return;

    const op$ = markPaid
      ? this.paymentService.markPaid(id, this.year, month).pipe(map(() => undefined))
      : this.paymentService.unmarkPaid(id, this.year, month);

    op$.subscribe({
      next: () => {
        // Reload the year so the table stays aligned with the server's
        // truth — cheaper than synthesising a partial AthletePayment row
        // (we'd need amount_cents and paid_at, which the server picks).
        this.load(id);
        const monthLabel = this.translate.instant(MONTH_KEYS[month - 1]);
        this.messageService.add({
          severity: 'success',
          summary: this.translate.instant(
            markPaid
              ? 'athletes.detail.payments.toast.markedPaidSummary'
              : 'athletes.detail.payments.toast.markedUnpaidSummary',
          ),
          detail: this.translate.instant('athletes.detail.payments.toast.markedDetail', {
            month: monthLabel,
            year: this.year,
          }),
          life: 3000,
        });
      },
      error: (err: { status?: number }) => {
        const detail = this.translate.instant(
          err.status === 422
            ? 'athletes.detail.payments.toast.errorMissingFee'
            : 'athletes.detail.payments.toast.errorGeneric',
        );
        this.messageService.add({
          severity: 'error',
          summary: this.translate.instant('athletes.detail.payments.toast.errorSummary'),
          detail,
          life: 4000,
        });
      },
    });
  }

  private load(athleteId: number): void {
    this.loading.set(true);
    this.paymentService
      .list(athleteId, this.year)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (payments) => this.payments.set(payments),
        // On error we deliberately KEEP the previous `payments` value
        // — Copilot caught (#260 review) that resetting to [] would
        // make every paid month silently flip to "Unpaid" in the UI,
        // which is misleading and removes the "Unmark" action right
        // when the user can't act on it. Surfacing the toast is
        // enough; the table stays at its last-known good state until
        // a successful reload replaces it.
        error: () =>
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('athletes.detail.payments.toast.errorSummary'),
            detail: this.translate.instant('athletes.detail.payments.toast.loadErrorDetail'),
            life: 4000,
          }),
      });
  }

  /**
   * Cheap: only fires when the page is opened directly (refresh on the
   * payments tab). When navigating from the documents/attendance tab
   * the parent component has already loaded the athlete — but we don't
   * want a tab to depend on parent state, so we fetch here too. The
   * server hits a single indexed lookup; cost is negligible.
   */
  private loadAthleteName(athleteId: number): void {
    this.athleteService.get(athleteId).subscribe({
      next: (athlete) => {
        this.athleteName.set(`${athlete.first_name} ${athlete.last_name}`);
        this.athleteFeeCents.set(athlete.monthly_fee_cents ?? null);
        this.feeTier.set(athlete.fee_tier ?? null);
        this.athleteBillingPeriod.set(athlete.billing_period_months ?? 1);
      },
      // Silent failure here — the confirm popup falls back to "this
      // athlete" rather than blocking the table, and `athleteFeeCents`
      // deliberately stays `undefined` so the fee is treated as unknown
      // rather than absent. Setting it to null here would lock every
      // button on a transient network blip.
      error: () => undefined,
    });
  }

  /**
   * "2 lezioni · €55.00 a month for 2 lessons a week." The lesson count
   * pluralises, and ngx-translate has no plural rule — the repo picks between
   * an explicit `…One` / `…Other` key pair in code.
   */
  protected feeTierHint(tier: FeeTier): string {
    return this.translate.instant(
      tier.lessons_per_week === 1
        ? 'athletes.detail.payments.feeTierHintOne'
        : 'athletes.detail.payments.feeTierHintOther',
      {
        label: tier.label,
        amount: this.formatAmount(tier.amount_cents),
        count: tier.lessons_per_week,
      },
    );
  }

  /**
   * "Feb – Apr 2026" for a period longer than one month, `null` for a plain
   * monthly payment where the row's own label already says everything.
   *
   * Shown on every month the period covers, which is how the reader knows the
   * €165 on February and the dash on March and April belong to one payment
   * rather than to three different stories.
   */
  protected periodCaption(row: MonthRow): string | null {
    return row.payment === null
      ? null
      : this.periodCaptionFor(row.payment.year, row.payment.month, row.periodMonths);
  }

  /** The same caption for a period that has not been recorded yet. */
  private periodCaptionFor(year: number, month: number, periodMonths: number): string | null {
    if (periodMonths <= 1) return null;

    const start = year * 12 + (month - 1);
    const end = start + periodMonths - 1;
    const label = (absolute: number): string => this.translate.instant(MONTH_KEYS[absolute % 12]);

    return this.translate.instant('athletes.detail.payments.periodRange', {
      from: label(start),
      to: label(end),
      year: Math.floor(end / 12),
    });
  }

  protected formatAmount(cents: number): string {
    const locale = localeFor(this.languageService.currentLang());
    return (cents / 100).toLocaleString(locale, { style: 'currency', currency: 'EUR' });
  }

  protected formatPaidAt(iso: string): string {
    // ISO-8601 → YYYY-MM-DD. Calendar date only — no timezone shift
    // needed since we're showing the day, not the local time.
    return iso.slice(0, 10);
  }
}

const MONTH_KEYS = [
  'month.january',
  'month.february',
  'month.march',
  'month.april',
  'month.may',
  'month.june',
  'month.july',
  'month.august',
  'month.september',
  'month.october',
  'month.november',
  'month.december',
] as const;
