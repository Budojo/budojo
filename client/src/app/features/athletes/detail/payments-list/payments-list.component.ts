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
import { finalize, map, forkJoin } from 'rxjs';
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
import { formatIsoDate, localeFor } from '../../../../shared/utils/locale';
import { CarnetPanelComponent } from '../carnet-panel/carnet-panel.component';
import { CONFIRM_REJECT_BUTTON } from '../../../../shared/utils/confirm-buttons';
import { MONTH_KEYS } from '../../../../shared/utils/months';
import { AcademyService } from '../../../../core/services/academy.service';

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
 * **Every month is markable, including ones that have not arrived.**
 * #1636 disabled them on the reasoning that there is nothing to mark paid
 * for July in May. That is wrong about how a gym actually takes money:
 * paying a month or a term in advance is ordinary, and the owner had no way
 * to record it — the row the money belonged to was the one row they could
 * not touch. The roster's inline toggle stays pinned to the current month,
 * because it is a one-click bulk surface where a stray tap on the wrong
 * month would be silent; this tab is the deliberate one, opened on a single
 * athlete, and it is where an advance payment gets recorded.
 */

interface MonthRow {
  readonly month: number;
  /**
   * The CALENDAR year this cell belongs to (#1709).
   *
   * A season crosses new year, so the table's own year is not the row's:
   * on a September academy, October is 2026 and February is 2027. Every
   * write and every message reads this rather than the table's, because a
   * single table-wide year would have sent half the season's marks to the
   * wrong one.
   */
  readonly year: number;
  readonly labelKey: string;
  /** The payment covering this month, whichever month its period started in. */
  readonly payment: AthletePayment | null;
  readonly canEdit: boolean;
  /**
   * True when this month falls before the academy started recording fees in
   * Budojo, or before the athlete joined (#1742) — whichever is later.
   *
   * Such a month has no answer here, so it gets none: no "Non pagato".
   * **Absence of a payment record is not arrears**, and for every month
   * before adoption the ledger was asserting a debt it has no knowledge of —
   * up to six seasons of amber per athlete on an academy that trained for
   * years before the app existed.
   *
   * It does NOT gate `canEdit`. The owner transcribing a paper register is
   * exactly the case that produces a payment below the floor, and the server
   * has always accepted one.
   */
  readonly beforeBillingFloor: boolean;
  /**
   * Why an unpaid month shows a neutral dash instead of "Non pagato", as a
   * translation key, or null when it is simply unpaid. Below the billing
   * floor (#1742), or for an athlete who trains free by their own fee
   * (#1757): in both a missing record is not a debt.
   */
  readonly notOwedReason: string | null;
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
  private readonly academyService = inject(AcademyService);
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
  private readonly currentYear = this.nowUtc.getUTCFullYear();
  private readonly currentMonth = this.nowUtc.getUTCMonth() + 1;

  /**
   * The year on screen (#1636, PAY-1).
   *
   * It used to be a constant, and the heading said "Pagamenti — 2026" with
   * nothing on the page able to move it: an athlete who joined in 2024 had
   * two years of history the app could not open. A constraint with no escape.
   */
  /**
   * The calendar year the season on screen STARTED in (#1709).
   *
   * Named for what it is: on a September academy the table headed 2026/27
   * runs October 2026 through August 2027, so `seasonYear` is 2026 and half
   * the rows are 2027. Every row carries its own year; this one only says
   * which season we are looking at.
   */
  /**
   * The season the reader has stepped to, or `null` for "whichever one we
   * are in". A plain signal seeded with a year cannot express that: the
   * academy answers after this field is built, and seeding it with the
   * CALENDAR year would open a September academy on 2026/27 all through the
   * spring — a season that has not started, showing an empty table, in June.
   */
  private readonly chosenSeason = signal<number | null>(null);

  /** The calendar year the season on screen started in. */
  protected readonly seasonYear = computed<number>(
    () => this.chosenSeason() ?? this.currentSeasonYear(),
  );

  /**
   * The month the academy's training year begins, 1-12.
   *
   * September by default, matching `App\Support\Season::DEFAULT_MONTH` —
   * an academy that never opens its settings gets a sensible year rather
   * than a null.
   */
  protected readonly seasonStartMonth = computed<number>(
    () => this.academyService.academy()?.season_start_month ?? 9,
  );

  /**
   * The season label a person reads: `2026/27`, or a bare `2026` for an
   * academy whose year starts in January and therefore does not cross one.
   *
   * The BOUNDARY rule — which season a given date falls in — is deliberately
   * not reimplemented here; it lives in `App\Support\Season` and arrives
   * as `season_start`, for the reason the roster's own comment gives: a
   * second copy in TypeScript is a second chance at the off-by-one. This is
   * only formatting, applied to a year the server already resolved.
   */
  protected readonly seasonLabel = computed<string>(() => {
    const start = this.seasonYear();
    return this.seasonStartMonth() === 1 ? `${start}` : `${start}/${`${start + 1}`.slice(-2)}`;
  });

  /**
   * Which season a calendar month falls in — the boundary rule, mirroring
   * `App\\Support\\Season::startFor`.
   *
   * Written once, here, and used by everything that needs it. The component
   * takes `season_start` from the server precisely so this rule does not
   * have to exist on the client — but an athlete's `joined_at` also has to
   * be placed in a season, and the payload does not say which. One named
   * copy with a pointer to the PHP is honest; three inlined `>=` comparisons
   * scattered through the file is how the off-by-one gets in, and it did:
   * `floorYear` compared a CALENDAR year against a SEASON year and made the
   * season an athlete joined in unreachable for eight of twelve joining
   * months.
   */
  private seasonOf(year: number, month: number): number {
    return month >= this.seasonStartMonth() ? year : year - 1;
  }

  /** The calendar year the current season began in, as the server resolved it. */
  private readonly currentSeasonYear = computed<number>(() => {
    const iso = this.academyService.academy()?.season_start;
    if (iso) return Number(iso.slice(0, 4));
    // The academy has not answered yet. Derive it the same way the server
    // would rather than guess the current calendar year: in March, that
    // guess is a whole season out.
    return this.seasonOf(this.currentYear, this.currentMonth);
  });

  /** The year this athlete joined — there is nothing to look at before it. */
  /**
   * The day they joined, as year and month — not just the year. A season is
   * placed by both (#1709); the year alone cannot say which side of the
   * boundary a January joiner falls on.
   */
  private readonly joinedOn = signal<{ year: number; month: number } | null>(null);

  /**
   * The earliest month worth showing anything for, as an absolute month index
   * (`year * 12 + month - 1`), or null when nothing floors this athlete.
   *
   * `null` is the pre-#1742 behaviour, exactly: an academy restored from an
   * older backup carries no `billing_from`, and the ledger must read as it
   * always did rather than blank somebody's history.
   */
  private readonly billingFloorMonth = signal<number | null>(null);

  /**
   * The server refuses to record a payment before this (`min:2020` on the
   * store request). Walking past it renders twelve inviting "Mark paid"
   * buttons that all 422, and the client reports that 422 as "set a monthly
   * fee first" — a message about a different problem entirely.
   */
  private static readonly EARLIEST_YEAR = 2020;

  /**
   * Which fetch the rows on screen came from, and which fetch is current.
   *
   * Stepping the year sets the heading immediately and the rows arrive later.
   * Without a guard, a failed or slow load leaves one year's ledger under
   * another year's heading — and every button in that table writes to the
   * heading's year, so unmarking a row fetched for 2026 would delete a 2025
   * payment the owner never saw. The attendance tab beside this one has
   * carried the same guard since it shipped; this copied its control and not
   * its guard.
   */
  private loadEpoch = 0;
  /** The season the rows on screen came from — see `loadEpoch`. */
  private readonly loadedYear = signal<number | null>(null);

  protected readonly canGoPrev = computed<boolean>(() => this.seasonYear() > this.floorYear());

  /**
   * The earliest SEASON worth opening: the one the athlete joined in, but
   * never before the one holding the first month the server will accept.
   *
   * Both bounds are seasons. Flooring a season with a calendar year is an
   * off-by-one for every athlete who joined before the season-start month —
   * on a September academy that is January through August, eight of twelve,
   * and it put the months they actually paid for behind a disabled chevron.
   *
   * When the athlete request fails the joining season is unknown, and the
   * hard floor is what stops the stepper walking back to 1999.
   */
  private readonly floorYear = computed<number>(() => {
    const billing = this.billingFloorSeason();
    const joined = this.joinedSeason();
    const serverFloor = this.seasonOf(PaymentsListComponent.EARLIEST_YEAR, 1);
    // `billing` already IS `max(academy floor, joining month)` — the server
    // resolved it (#1742) — so `joined` is only the fallback for a response
    // that did not carry one.
    return Math.max(billing ?? joined ?? serverFloor, serverFloor);
  });

  /** The season the billing floor falls in — see `seasonOf`. */
  private readonly billingFloorSeason = computed<number | null>(() => {
    const absolute = this.billingFloorMonth();
    if (absolute === null) return null;
    return this.seasonOf(Math.floor(absolute / 12), (absolute % 12) + 1);
  });

  /** The season the athlete's joining date falls in — see `seasonOf`. */
  private readonly joinedSeason = computed<number | null>(() => {
    const joined = this.joinedOn();
    if (joined === null) return null;
    return this.seasonOf(joined.year, joined.month);
  });

  /**
   * No forward travel past the season in progress. A season that has started
   * but not ended is the normal case — the old rule refused any year beyond
   * the current calendar one, which on a September academy would have locked
   * the owner out of their own season from January onwards (#1709).
   */
  protected readonly canGoNext = computed<boolean>(
    () => this.seasonYear() < this.currentSeasonYear(),
  );

  protected prevYear(): void {
    if (this.canGoPrev()) this.goToYear(this.seasonYear() - 1);
  }

  protected nextYear(): void {
    if (this.canGoNext()) this.goToYear(this.seasonYear() + 1);
  }

  private goToYear(next: number): void {
    this.chosenSeason.set(next);
    const id = this.athleteId();
    if (id !== null) this.load(id);
  }

  /**
   * What this athlete pays each month, resolved server-side (#1381): their
   * own fee (#1757), else their price tier, else the academy's flat fee.
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

  /** Their own fee (#1757): null when they inherit, 0 when they train free. */
  protected readonly feeOverrideCents = signal<number | null>(null);

  protected readonly trainsFree = computed(() => this.feeOverrideCents() === 0);

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
    // for. Keyed by ABSOLUTE month (year * 12 + month - 1) rather than by
    // month-of-year, because a season spans two calendar years and 1 means
    // January of whichever one (#1709).
    const byAbsolute = new Map<number, AthletePayment>();
    for (const p of this.payments()) {
      for (let i = 0; i < (p.period_months ?? 1); i++) {
        byAbsolute.set(p.year * 12 + (p.month - 1) + i, p);
      }
    }

    const fee = this.hasMonthlyFee();
    const free = this.trainsFree();
    const floorMonth = this.billingFloorMonth();
    const first = this.seasonYear() * 12 + (this.seasonStartMonth() - 1);

    return Array.from({ length: 12 }, (_, slot) => {
      const absolute = first + slot;
      const year = Math.floor(absolute / 12);
      const month = (absolute % 12) + 1;
      const payment = byAbsolute.get(absolute) ?? null;
      const beforeBillingFloor = floorMonth !== null && absolute < floorMonth;
      // Read-only when no monthly fee is configured at all — there's nothing
      // to record. While the fee is still unknown the buttons stay live: a
      // click that really has no fee behind it gets the server's 422 and its
      // toast, which is a better trade than flickering the whole table
      // read-only on every visit.
      //
      // No cap at today: an athlete who pays October in September has to be
      // recordable in October's row, which is the only row that means it
      // (#1711). The server has always allowed it.
      return {
        month,
        year,
        labelKey: MONTH_KEYS[month - 1],
        payment,
        // Per ROW, not per table: the earliest season straddles the server's
        // `min:2020`, so its first months are outside what the server will
        // accept while the rest of the same table is inside it. Flooring the
        // whole season either hides months that are recordable or offers
        // buttons that 422 (#1709).
        canEdit: fee && year >= PaymentsListComponent.EARLIEST_YEAR,
        // Below the floor this month has no answer, so the table gives none
        // (#1742). Deliberately NOT folded into `canEdit`: the two floors
        // mean different things. `EARLIEST_YEAR` mirrors the server's
        // `min:2020` — a write the API will refuse. This one is a statement
        // about knowledge, and the owner transcribing a paper register must
        // still be able to record against it.
        beforeBillingFloor,
        notOwedReason: beforeBillingFloor
          ? 'athletes.detail.payments.beforeBillingFloor'
          : free
            ? 'athletes.detail.payments.trainsFree'
            : null,
        coveredByEarlierPeriod:
          payment !== null && !(payment.year === year && payment.month === month),
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
    // Both branches name the WHOLE span, deliberately. The row captions
    // stopped doing that in #1714 — each row there says the thing its reader
    // does not already know — but a confirm is the opposite situation: the
    // reader is about to create or undo the entire period, so "from February
    // to April" is exactly what they need and "part of the February payment"
    // would hide the two months the click also touches.
    const period = willMarkPaid
      ? this.periodCaptionFor(row.year, row.month, this.athleteBillingPeriod())
      : row.payment !== null
        ? this.periodCaptionFor(row.payment.year, row.payment.month, row.periodMonths)
        : null;

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
            { name: fullName, month: this.translate.instant(row.labelKey), year: row.year },
          );

    this.confirmationService.confirm({
      target: event.currentTarget as EventTarget,
      message,
      // Without labels PrimeNG renders its own "Yes"/"No" in one colour, so
      // the answer that wipes a recorded payment looked exactly like the one
      // that walks away (#1644). The accept repeats the verb from the
      // question; only un-marking is destructive.
      acceptLabel: this.translate.instant(
        willMarkPaid
          ? 'athletes.detail.payments.confirm.markPaidAccept'
          : 'athletes.detail.payments.confirm.markUnpaidAccept',
      ),
      rejectLabel: this.translate.instant('common.cancel'),
      rejectButtonProps: CONFIRM_REJECT_BUTTON,
      acceptButtonProps: willMarkPaid ? undefined : { severity: 'danger' },
      accept: () => this.applyToggle(row.year, row.month, willMarkPaid),
    });
  }

  /**
   * `year` comes from the ROW, not from the table (#1709). A season crosses
   * new year, so half these cells belong to `seasonYear + 1` — sending the
   * table's year would have written February 2027's payment onto February
   * 2026, silently, in the one place the app handles money.
   */
  private applyToggle(year: number, month: number, markPaid: boolean): void {
    const id = this.athleteId();
    if (id === null) return;

    const op$ = markPaid
      ? this.paymentService.markPaid(id, year, month).pipe(map(() => undefined))
      : this.paymentService.unmarkPaid(id, year, month);

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
            year,
          }),
          life: 3000,
        });
      },
      error: (err: { status?: number; error?: { errors?: Record<string, unknown> } }) => {
        // A 422 has meant one thing for a long time — "no fee configured" —
        // and since #1382 it can also mean "a period already covers that
        // month". Read which field the server complained about rather than
        // showing a message that is flatly untrue half the time.
        const fields = err.error?.errors ?? {};
        const detail = this.translate.instant(
          err.status !== 422
            ? 'athletes.detail.payments.toast.errorGeneric'
            : 'period_months' in fields
              ? 'athletes.detail.payments.toast.errorOverlap'
              : // A year outside the server's window used to fall through to
                // "set a monthly fee first", on an academy that has one.
                'year' in fields
                ? 'athletes.detail.payments.toast.errorYear'
                : 'athletes.detail.payments.toast.errorMissingFee',
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
    // Which fetch this is, and which season it is for. A season step fires a
    // new one while the old may still be in flight, and the old answer must
    // not land on top of the new — nor un-skeleton the table showing the
    // season the reader just left.
    const epoch = ++this.loadEpoch;
    const forYear = this.seasonYear();
    this.loading.set(true);
    // A season that crosses new year lives in two calendar years, and the
    // endpoint takes one (`?year=N`). So ask twice and merge, rather than
    // grow the API contract for a screen that can answer the question with
    // the shape it already has (#1709). A January-start academy asks once.
    const years = this.seasonStartMonth() === 1 ? [forYear] : [forYear, forYear + 1];
    forkJoin(years.map((y) => this.paymentService.list(athleteId, y)))
      .pipe(
        map((pages) => pages.flat()),
        finalize(() => {
          if (epoch === this.loadEpoch) this.loading.set(false);
        }),
      )
      .subscribe({
        next: (payments) => {
          if (epoch !== this.loadEpoch) return;
          this.payments.set(payments);
          this.loadedYear.set(forYear);
        },
        // On error we deliberately KEEP the previous `payments` value
        // — Copilot caught (#260 review) that resetting to [] would
        // make every paid month silently flip to "Unpaid" in the UI,
        // which is misleading and removes the "Unmark" action right
        // when the user can't act on it. Surfacing the toast is
        // enough; the table stays at its last-known good state until
        // a successful reload replaces it.
        error: () => {
          if (epoch !== this.loadEpoch) return;
          // Keeping the rows is right — resetting to [] would flip every paid
          // month to "Unpaid" on a network blip (#260). But keeping them
          // under a heading naming a year they are NOT from is worse than
          // either: the table is live, and unmarking a row would delete a
          // payment from the year the heading names. So the heading goes back
          // to the year the rows actually are, and the toast says why.
          const loaded = this.loadedYear();
          if (loaded !== null && loaded !== forYear) this.chosenSeason.set(loaded);
          this.messageService.add({
            severity: 'error',
            summary: this.translate.instant('athletes.detail.payments.toast.errorSummary'),
            detail: this.translate.instant('athletes.detail.payments.toast.loadErrorDetail'),
            life: 4000,
          });
        },
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
        // First, not last. As the final statement a throw here left every
        // signal at its constructor value — including `joinedOn`, whose
        // default is the same `null` the guarded read produces — so the test
        // named for this regression could not see it.
        const joinedYear = Number(athlete.joined_at?.slice(0, 4));
        const joinedMonth = Number(athlete.joined_at?.slice(5, 7));
        this.joinedOn.set(
          Number.isFinite(joinedYear) && Number.isFinite(joinedMonth) && joinedMonth >= 1
            ? { year: joinedYear, month: joinedMonth }
            : null,
        );

        // The resolved floor, not the two inputs (#1742). The server combines
        // `academies.billing_from` with this athlete's joining month; doing it
        // here would be a second implementation of a `max()` over two dates,
        // which is the shape the #1709 off-by-one already took once.
        const floor = athlete.billing_floor;
        const floorYearPart = Number(floor?.slice(0, 4));
        const floorMonthPart = Number(floor?.slice(5, 7));
        this.billingFloorMonth.set(
          floor && Number.isFinite(floorYearPart) && Number.isFinite(floorMonthPart)
            ? floorYearPart * 12 + (floorMonthPart - 1)
            : null,
        );

        this.athleteName.set(`${athlete.first_name} ${athlete.last_name}`);
        this.athleteFeeCents.set(athlete.monthly_fee_cents ?? null);
        this.feeTier.set(athlete.fee_tier ?? null);
        this.feeOverrideCents.set(athlete.fee_override_cents ?? null);
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
  /**
   * The period this athlete pays on, and what one period costs (#1636, PAY-4).
   *
   * A quarterly payer's subtitle read "70,00 € al mese per 7 lezioni a
   * settimana" and the period was discoverable only by reading the rows —
   * three of which say "Pagato · — · 2 gennaio" for one payment. `null` on a
   * plain monthly payer, where the monthly figure already says everything.
   *
   * The words come from the athlete form's own picker, so the page names the
   * period the same way the control that set it does.
   */
  protected readonly billingPeriodHint = computed<string | null>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    const months = this.athleteBillingPeriod();
    const monthly = this.athleteFeeCents();
    // Nothing to say about the period of a fee of nothing (#1757).
    if (months <= 1 || monthly === null || monthly === undefined || monthly === 0) return null;

    const KEYS: Readonly<Record<number, string>> = {
      3: 'athletes.form.billingPeriod.quarterly',
      6: 'athletes.form.billingPeriod.halfYearly',
      12: 'athletes.form.billingPeriod.annual',
    };
    const key = KEYS[months];
    const period =
      key !== undefined
        ? this.translate.instant(key)
        : this.translate.instant('athletes.detail.payments.periodMonths', { count: months });

    return this.translate.instant('athletes.detail.payments.periodHint', {
      period,
      amount: this.formatAmount(monthly * months),
    });
  });

  /**
   * "Personal fee: €40.00 a month" or "Trains free" (#1757). It replaces the
   * tier line, because the override is what they pay whatever tier they are
   * on, and two captions naming two amounts would leave the owner to work
   * out which one wins.
   */
  protected readonly feeOverrideHint = computed<string | null>(() => {
    this.languageService.currentLang(); // signal dep — recompute on toggle
    const cents = this.feeOverrideCents();
    if (cents === null) return null;
    if (cents === 0) return this.translate.instant('athletes.detail.payments.trainsFreeHint');

    return this.translate.instant('athletes.detail.payments.feeOverrideHint', {
      amount: this.formatAmount(cents),
    });
  });

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
    const payment = row.payment;
    if (payment === null || row.periodMonths <= 1) return null;

    // Each row says the thing its reader does not already know (#1714).
    //
    // One string on all three rows of a quarter meant the row that STARTS
    // the period explained itself to itself — "settembre · Da settembre a
    // novembre" — and that is exactly where a reader stops and asks what
    // they are being told. On the covered rows the same string earns its
    // place: it is the only thing explaining a "Paid" with a dash for an
    // amount.
    if (row.coveredByEarlierPeriod) {
      return this.translate.instant('athletes.detail.payments.periodCoveredBy', {
        month: this.translate.instant(MONTH_KEYS[payment.month - 1]),
      });
    }

    const rest = Array.from({ length: row.periodMonths - 1 }, (_, i) =>
      this.translate.instant(MONTH_KEYS[(payment.month + i) % 12]),
    );
    return this.translate.instant(
      rest.length === 1
        ? 'athletes.detail.payments.periodStartsHereOne'
        : 'athletes.detail.payments.periodStartsHereOther',
      { next: this.listWords(rest) },
    );
  }

  /**
   * "ottobre e novembre", "ottobre, novembre e dicembre" — the language's own
   * list, not a comma-joined array. `Intl.ListFormat` knows the conjunction
   * for both languages the app speaks.
   */
  private listWords(words: readonly string[]): string {
    const locale = localeFor(this.languageService.currentLang());
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(words);
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

  /**
   * The day the money changed hands, written the way the rest of the app
   * writes a day (#1537).
   *
   * This printed the raw `YYYY-MM-DD` until #1537 — four lines below a header
   * already reading "Joined 15 January 2022", which is the pairing that made
   * it obvious. `formatIsoDate` parses field by field rather than through
   * `new Date(iso)`, so it keeps the calendar-date property the old slice was
   * protecting: no UTC parse, no midnight shift, no time of day.
   */
  protected formatPaidAt(iso: string): string {
    return formatIsoDate(iso, this.languageService.currentLang());
  }
}
