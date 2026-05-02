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
import { AcademyService } from '../../../../core/services/academy.service';
import { AthleteService } from '../../../../core/services/athlete.service';
import { AthletePayment, PaymentService } from '../../../../core/services/payment.service';

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
  readonly payment: AthletePayment | null;
  readonly canEdit: boolean;
}

@Component({
  selector: 'app-payments-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    TranslatePipe,
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
  private readonly academyService = inject(AcademyService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly translate = inject(TranslateService);
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
   * Read from the cached academy signal — same gate the athletes
   * list uses. When the academy hasn't set `monthly_fee_cents`, the
   * page renders the table read-only (no buttons): the user is told
   * upfront, no surprising 422 toast.
   */
  protected readonly hasMonthlyFee = computed(
    () => (this.academyService.academy()?.monthly_fee_cents ?? null) !== null,
  );

  /**
   * Pre-built 12-row view-model — joins the loaded payments with
   * January…December. Stable order, OnPush-friendly (re-runs only
   * when `payments` or `hasMonthlyFee` changes).
   */
  protected readonly monthRows = computed<MonthRow[]>(() => {
    const byMonth = new Map<number, AthletePayment>();
    for (const p of this.payments()) byMonth.set(p.month, p);

    const fee = this.hasMonthlyFee();
    return MONTH_KEYS.map((labelKey, i) => {
      const month = i + 1;
      // Future months can't be paid (the month hasn't happened); past
      // and current months can. Read-only when no monthly fee is
      // configured at all — there's nothing to record.
      const canEdit = fee && month <= this.currentMonth;
      return {
        month,
        labelKey,
        payment: byMonth.get(month) ?? null,
        canEdit,
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
    const monthLabel = this.translate.instant(row.labelKey);
    const message = this.translate.instant(
      willMarkPaid
        ? 'athletes.detail.payments.confirm.markPaidMessage'
        : 'athletes.detail.payments.confirm.markUnpaidMessage',
      { name: fullName, month: monthLabel, year: this.year },
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
      next: (athlete) => this.athleteName.set(`${athlete.first_name} ${athlete.last_name}`),
      // Silent failure here — the confirm popup falls back to "this
      // athlete" rather than blocking the table.
      error: () => undefined,
    });
  }

  protected formatAmount(cents: number): string {
    return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'EUR' });
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
