import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import type { Mock } from 'vitest';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';
import { AcademyService } from '../../../../core/services/academy.service';
import { AthleteService } from '../../../../core/services/athlete.service';
import { AthletePayment, PaymentService } from '../../../../core/services/payment.service';
import { PaymentsListComponent } from './payments-list.component';

/** Per-year payment fixtures, keyed the way the endpoint is. */
const PAYMENTS_BY_YEAR = new Map<number, AthletePayment[]>();

class FakePaymentService {
  // Honours the year it is asked for. A fake that ignores it returns the SAME
  // array for both calls of a season, so `pages.flat()` merges a payload with
  // its own duplicate and dropping half the fetch passes the suite (#1709).
  readonly list = vi.fn((_athleteId: number, year: number) =>
    of(PAYMENTS_BY_YEAR.get(year) ?? ([] as AthletePayment[])),
  );
  readonly markPaid = vi.fn(() =>
    of({
      id: 99,
      athlete_id: 42,
      // March of the 2026/27 season is March 2027 (#1709).
      year: 2027,
      month: 3,
      amount_cents: 9500,
      paid_at: '2027-03-05T10:00:00Z',
    } as AthletePayment),
  );
  readonly unmarkPaid = vi.fn(() => of(void 0));
}

/**
 * `monthly_fee_cents` and `fee_tier` come from the athlete since #1381 — the
 * component asks "what does THIS athlete pay", not "what does the academy
 * charge", because an academy that prices only by tier has no flat fee.
 */
class FakeAthleteService {
  readonly get = vi.fn(() =>
    of({
      id: 42,
      first_name: 'Mario',
      last_name: 'Rossi',
      monthly_fee_cents: 9500,
      fee_tier: null,
    }),
  );
}

const ACADEMY_BASE = {
  id: 1,
  name: 'Test',
  slug: 'test',
  address: null,
  logo_url: null,
  // A September academy, stated rather than defaulted: the payments table is
  // built on the season now (#1709), and a fixture that leans on the fallback
  // would stop testing the thing the moment the fallback changed.
  season_start_month: 9,
  season_start: '2026-09-01',
} as const;

function setup(
  opts: {
    fee?: number | null;
    feeTier?: { id: number; label: string; amount_cents: number; lessons_per_week: number } | null;
    payments?: AthletePayment[];
    joinedAt?: string;
    billingPeriodMonths?: number;
    /** The athlete's own fee in cents (#1757); it wins over `fee` and the tier. */
    feeOverride?: number | null;
    /** The resolved floor as the server sends it, `YYYY-MM-01` (#1742). */
    billingFloor?: string | null;
    /** Override the academy's season — the table is built on it (#1709). */
    academy?: { season_start_month: number; season_start: string };
  } = {},
) {
  TestBed.configureTestingModule({
    imports: [PaymentsListComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PaymentService, useClass: FakePaymentService },
      { provide: AthleteService, useClass: FakeAthleteService },
      {
        provide: ActivatedRoute,
        useValue: {
          parent: {
            paramMap: of(convertToParamMap({ id: '42' })),
          },
        },
      },
      ...provideI18nTesting(),
    ],
  });

  const fee = opts.fee === undefined ? 9500 : opts.fee;
  TestBed.inject(AcademyService).academy.set({
    ...ACADEMY_BASE,
    ...(opts.academy ?? {}),
    monthly_fee_cents: fee,
  });

  const athleteSvc = TestBed.inject(AthleteService) as unknown as { get: Mock };
  athleteSvc.get = vi.fn(() =>
    of({
      id: 42,
      first_name: 'Mario',
      last_name: 'Rossi',
      monthly_fee_cents:
        opts.feeOverride != null
          ? opts.feeOverride
          : opts.feeTier
            ? opts.feeTier.amount_cents
            : fee,
      fee_tier: opts.feeTier ?? null,
      fee_override_cents: opts.feeOverride ?? null,
      // Undefined unless a test says otherwise — that is how the fixture was,
      // and reading it unguarded threw 16 unhandled rxjs errors without
      // failing a single test (#1636).
      joined_at: opts.joinedAt,
      billing_period_months: opts.billingPeriodMonths,
      billing_floor: opts.billingFloor,
    }),
  );

  // Each payment is filed under its OWN calendar year, so a season that
  // crosses new year genuinely needs both requests to see all of them —
  // which is what makes the merge testable at all (#1709).
  PAYMENTS_BY_YEAR.clear();
  for (const p of opts.payments ?? []) {
    const bucket = PAYMENTS_BY_YEAR.get(p.year) ?? [];
    bucket.push(p);
    PAYMENTS_BY_YEAR.set(p.year, bucket);
  }

  const fixture = TestBed.createComponent(PaymentsListComponent);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance };
}

describe('PaymentsListComponent (#182 Surface 2)', () => {
  it('loads both calendar years the season spans', () => {
    const { component } = setup();
    const svc = TestBed.inject(PaymentService) as unknown as { list: Mock };

    // A September season runs into the next calendar year, and the endpoint
    // takes one year at a time — so the table asks twice and merges (#1709).
    expect(svc.list).toHaveBeenCalledTimes(2);
    expect(svc.list.mock.calls[0]).toEqual([42, 2026]);
    expect(svc.list.mock.calls[1]).toEqual([42, 2027]);
    expect(component['athleteName']()).toBe('Mario Rossi');
  });

  it('asks only once for an academy whose year starts in January', () => {
    // The negative control for the line above: a January season does not
    // cross new year, so the second request would be a wasted round-trip.
    const { component } = setup({
      academy: { season_start_month: 1, season_start: '2026-01-01' },
    });
    const svc = TestBed.inject(PaymentService) as unknown as { list: Mock };

    expect(svc.list).toHaveBeenCalledTimes(1);
    expect(svc.list.mock.calls[0]).toEqual([42, 2026]);
    expect(component['seasonLabel']()).toBe('2026');
  });

  it("renders the twelve months in the season's order, not the calendar's", () => {
    const { fixture, component } = setup();

    const rows = fixture.nativeElement.querySelectorAll('[data-cy^="payment-row-"]');
    expect(rows.length).toBe(12);

    // September first, August last — the academy's year, not January's.
    expect(rows[0].getAttribute('data-cy')).toBe('payment-row-9');
    expect(rows[11].getAttribute('data-cy')).toBe('payment-row-8');

    // And it wraps the calendar year in the middle, which is the whole
    // reason every row carries its own.
    const months = component['monthRows']().map((r: { month: number }) => r.month);
    expect(months).toEqual([9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8]);
    const years = component['monthRows']().map((r: { year: number }) => r.year);
    expect(years).toEqual([2026, 2026, 2026, 2026, 2027, 2027, 2027, 2027, 2027, 2027, 2027, 2027]);
  });

  it('renders Paid badge + amount + date on rows that have a payment', () => {
    const payment: AthletePayment = {
      id: 1,
      athlete_id: 42,
      // March of the 2026/27 season is March 2027 (#1709).
      year: 2027,
      month: 3,
      amount_cents: 9500,
      paid_at: '2027-03-05T10:00:00Z',
    };
    const { fixture } = setup({ payments: [payment] });

    const marchRow = fixture.nativeElement.querySelector(
      '[data-cy="payment-row-3"]',
    ) as HTMLElement;
    expect(marchRow.textContent).toContain('Paid');
    // Currency formatting: the test runs in en-US locale via vitest, so
    // 9500 cents → "€95.00". We assert the integer portion is present so
    // a future locale tweak doesn't churn this assertion.
    expect(marchRow.textContent).toContain('95');
    // Written for a reader since #1537 — and still the calendar day the
    // server recorded, because the timestamp is truncated rather than
    // converted (23:00 UTC on the 31st must not become the 1st in Rome).
    expect(marchRow.textContent).toContain('5 March 2027');
  });

  it('hides edit buttons on every row when the academy has no monthly fee', () => {
    const { fixture } = setup({ fee: null });

    const markButtons = fixture.nativeElement.querySelectorAll('[data-cy^="payment-mark-"]');
    const unmarkButtons = fixture.nativeElement.querySelectorAll('[data-cy^="payment-unmark-"]');
    expect(markButtons.length).toBe(0);
    expect(unmarkButtons.length).toBe(0);

    // The "no fee" hint is visible so the user understands why the
    // table is read-only.
    expect(fixture.nativeElement.querySelector('[data-cy="payments-no-fee-hint"]')).not.toBeNull();
  });

  it('stays editable on a tier athlete even when the academy has no flat fee (#1381)', () => {
    const { fixture } = setup({
      fee: null,
      feeTier: { id: 7, label: '2 lezioni', amount_cents: 5500, lessons_per_week: 2 },
    });

    // The academy prices only by tier, so the old academy-level gate would
    // have locked this athlete out of being marked paid.
    expect(fixture.nativeElement.querySelector('[data-cy="payments-no-fee-hint"]')).toBeNull();
    const tierHint = fixture.nativeElement.querySelector('[data-cy="payments-fee-tier"]');
    expect(tierHint).not.toBeNull();
    expect(tierHint.textContent).toContain('2 lezioni');
    expect(tierHint.textContent).toContain('55');
  });

  it('keeps the table usable when the athlete request fails (#1381)', () => {
    TestBed.configureTestingModule({
      imports: [PaymentsListComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PaymentService, useClass: FakePaymentService },
        {
          provide: AthleteService,
          useValue: { get: vi.fn(() => throwError(() => ({ status: 500 }))) },
        },
        {
          provide: ActivatedRoute,
          useValue: { parent: { paramMap: of(convertToParamMap({ id: '42' })) } },
        },
        ...provideI18nTesting(),
      ],
    });
    TestBed.inject(AcademyService).academy.set({ ...ACADEMY_BASE, monthly_fee_cents: 9500 });

    const fixture = TestBed.createComponent(PaymentsListComponent);
    fixture.detectChanges();

    // The fee stays unknown, not absent: claiming "no fee configured" on a
    // network blip would lock every button, which is what the silent-failure
    // comment on the load handler exists to prevent.
    expect(fixture.nativeElement.querySelector('[data-cy="payments-no-fee-hint"]')).toBeNull();
    const marks = fixture.nativeElement.querySelectorAll('[data-cy^="payment-mark-"]');
    expect(marks.length).toBeGreaterThan(0);
  });

  describe('a personal fee (#1757)', () => {
    const tier = { id: 7, label: '2 lezioni', amount_cents: 5500, lessons_per_week: 2 };

    it('names the personal fee instead of the tier it replaces', () => {
      const { fixture } = setup({ feeTier: tier, feeOverride: 4000 });
      const el: HTMLElement = fixture.nativeElement;

      // Two captions naming two amounts would leave the owner to work out
      // which one wins.
      expect(el.querySelector('[data-cy="payments-fee-tier"]')).toBeNull();
      const hint = el.querySelector('[data-cy="payments-fee-override"]');
      expect(hint?.textContent).toContain('Personal fee');
      expect(hint?.textContent).toContain('40');
    });

    it('says an athlete who trains free owes nothing, and dashes the unpaid months', () => {
      const { fixture } = setup({ feeTier: tier, feeOverride: 0, billingPeriodMonths: 3 });
      const el: HTMLElement = fixture.nativeElement;

      expect(el.querySelector('[data-cy="payments-fee-override"]')?.textContent).toContain(
        'Trains free',
      );
      // No "Quarterly · €0.00": there is no period to a fee of nothing.
      expect(el.querySelector('[data-cy="payments-period-hint"]')).toBeNull();
      // Not a month of amber "Unpaid" for money nobody owes.
      const rows: { notOwedReason: string | null }[] = fixture.componentInstance['monthRows']();
      expect(rows.every((row) => row.notOwedReason === 'athletes.detail.payments.trainsFree')).toBe(
        true,
      );
      expect(el.textContent).not.toContain('Unpaid');
    });

    it('still lets a payment be recorded for them', () => {
      // A fee of 0 is a fee that applies: the server records it at 0.
      const { fixture } = setup({ feeOverride: 0 });

      expect(fixture.nativeElement.querySelector('[data-cy="payments-no-fee-hint"]')).toBeNull();
      expect(
        fixture.nativeElement.querySelectorAll('[data-cy^="payment-mark-"]').length,
      ).toBeGreaterThan(0);
    });
  });

  it('names no tier when the athlete is on the academy flat fee', () => {
    const { fixture } = setup();

    expect(fixture.nativeElement.querySelector('[data-cy="payments-fee-tier"]')).toBeNull();
  });

  it('confirmToggleRow → on accept (mark paid) calls PaymentService.markPaid + reloads + toasts', () => {
    const payment: AthletePayment = {
      id: 1,
      athlete_id: 42,
      // January of the 2026/27 season is January 2027 (#1709).
      year: 2027,
      month: 1,
      amount_cents: 9500,
      paid_at: '2027-01-15T10:00:00Z',
    };
    const { fixture, component } = setup({ payments: [payment] });

    // Stub the confirmation popup to immediately accept.
    const confirmService = fixture.componentRef.injector.get(ConfirmationService);
    confirmService.confirm = vi.fn((cfg: { accept: () => void }) => {
      cfg.accept();
      return confirmService;
    }) as never;

    const messageSpy = vi.spyOn(fixture.componentRef.injector.get(MessageService), 'add');
    const markSpy = TestBed.inject(PaymentService).markPaid as unknown as Mock;
    const listSpy = TestBed.inject(PaymentService).list as unknown as Mock;

    // Pick an editable unpaid month — January is paid, so use February
    // (paid: null). By month, not by index: the rows are in SEASON order
    // now, so position 1 is October (#1709).
    const februaryRow = component['monthRows']().find((r: { month: number }) => r.month === 2)!;
    expect(februaryRow.month).toBe(2);
    expect(februaryRow.payment).toBeNull();

    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', { value: document.createElement('button') });

    component.confirmToggleRow(event, februaryRow);

    expect(markSpy).toHaveBeenCalledTimes(1);
    // February of a 2026/27 season is February 2027, and the write has to
    // carry that rather than the season's own year (#1709).
    // No period override, and an empty receipt: nothing was said about the
    // transaction, so the server dates it today and records no method (#1761).
    expect(markSpy.mock.calls[0]).toEqual([42, 2027, 2, undefined, {}]);
    // After success the table reloads. Two requests per load, one per
    // calendar year the season spans — so init + reload is four.
    expect(listSpy).toHaveBeenCalledTimes(4);
    expect(messageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ severity: 'success', summary: 'Marked paid' }),
    );
  });

  it('confirmToggleRow → 422 surfaces the missing-fee error toast', () => {
    const { fixture, component } = setup({ payments: [] });

    const confirmService = fixture.componentRef.injector.get(ConfirmationService);
    confirmService.confirm = vi.fn((cfg: { accept: () => void }) => {
      cfg.accept();
      return confirmService;
    }) as never;

    const paymentSvc = TestBed.inject(PaymentService);
    (paymentSvc as unknown as { markPaid: Mock }).markPaid = vi.fn(() =>
      throwError(() => ({ status: 422 })),
    );

    const messageSpy = vi.spyOn(fixture.componentRef.injector.get(MessageService), 'add');

    const januaryRow = component['monthRows']()[0];
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', { value: document.createElement('button') });
    component.confirmToggleRow(event, januaryRow);

    expect(messageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: 'error',
        detail: expect.stringContaining('monthly fee'),
      }),
    );
  });
});

describe('PaymentsListComponent — billing periods (#1382)', () => {
  // The season the fixture academy is in, stated rather than read off the
  // wall clock: the table is built on the season now (#1709), so a fixture
  // that asks `new Date()` what year it is describes a different table every
  // September.
  const SEASON = 2026;

  /** A month's own calendar year inside a September season. */
  const yearOf = (month: number): number => (month >= 9 ? SEASON : SEASON + 1);

  function quarterlyFrom(month: number): AthletePayment {
    const year = yearOf(month);
    return {
      id: 7,
      athlete_id: 42,
      year,
      month,
      period_months: 3,
      amount_cents: 16500,
      paid_at: `${year}-${`${month}`.padStart(2, '0')}-05T10:00:00Z`,
    };
  }

  it('marks every month of the period paid, not only the one it started in', () => {
    const { fixture } = setup({ payments: [quarterlyFrom(2)] });

    for (const month of [2, 3, 4]) {
      const row = fixture.nativeElement.querySelector(`[data-cy="payment-row-${month}"]`);
      expect(row.textContent, `month ${month}`).toContain('Paid');
    }
    expect(fixture.nativeElement.querySelector('[data-cy="payment-row-5"]').textContent).toContain(
      'Unpaid',
    );
  });

  it('shows the amount once, on the month the period started', () => {
    const { fixture } = setup({ payments: [quarterlyFrom(2)] });

    // Repeating €165 on all three rows would treble the year's takings on a
    // table people read as a ledger.
    expect(fixture.nativeElement.querySelector('[data-cy="payment-row-2"]').textContent).toContain(
      '165',
    );
    expect(
      fixture.nativeElement.querySelector('[data-cy="payment-row-3"]').textContent,
    ).not.toContain('165');
    expect(
      fixture.nativeElement.querySelector('[data-cy="payment-row-4"]').textContent,
    ).not.toContain('165');
  });

  it('still names the WHOLE period in the confirm, where the row captions do not', () => {
    // #1714 made each row say only what its reader does not already know.
    // A confirm is the opposite case: the click touches all three months, so
    // hiding two of them behind "part of the February payment" would be the
    // consequence not shown before the act. Sharing one helper between the
    // two collapsed them, and CI caught it.
    const { fixture, component } = setup({ payments: [quarterlyFrom(2)] });
    // Component-scoped, like the mark-paid test beside this one — a
    // `TestBed.inject` finds no provider for it.
    const confirmation = fixture.componentRef.injector.get(ConfirmationService);
    const spy = vi.spyOn(confirmation, 'confirm').mockImplementation(() => confirmation);

    const february = component['monthRows']().find((r: { month: number }) => r.month === 2)!;
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', { value: document.createElement('button') });
    component.confirmToggleRow(event, february);

    const message = spy.mock.calls[0][0].message as string;
    expect(message).toContain('February');
    expect(message).toContain('April');
    expect(message).not.toContain('Part of');
  });

  it('tells each row the thing it does not already know', () => {
    const { fixture } = setup({ payments: [quarterlyFrom(2)] });
    const caption = (month: number) =>
      fixture.nativeElement
        .querySelector(`[data-cy="payment-period-${month}"]`)
        ?.textContent?.trim();

    // The row that STARTS the period used to say "February · from February
    // to April", explaining itself to itself — which is where the reader
    // stopped and asked what they were being told (#1714). It says what the
    // payment buys BEYOND this row.
    expect(caption(2)).toBe('Also covers March and April');

    // The covered rows keep the thing that earns its place: the only
    // explanation for a "Paid" with a dash where the amount goes.
    expect(caption(3)).toBe('Part of the February payment');
    expect(caption(4)).toBe('Part of the February payment');

    // And the starting row never claims to be covered by itself.
    expect(caption(2)).not.toContain('Part of');
  });

  it("joins the covered months with the language's own conjunction", () => {
    // "March and April", not "March, April" — and the Italian gets "e"
    // rather than a comma, which a hand-rolled join would have to know.
    const { fixture } = setup({ payments: [{ ...quarterlyFrom(2), period_months: 4 }] });
    const caption = fixture.nativeElement
      .querySelector('[data-cy="payment-period-2"]')
      ?.textContent?.trim();
    expect(caption).toBe('Also covers March, April and May');
  });

  it('leaves a plain monthly payment reading exactly as it always did', () => {
    const payment: AthletePayment = {
      id: 1,
      athlete_id: 42,
      year: yearOf(3),
      month: 3,
      period_months: 1,
      amount_cents: 9500,
      paid_at: `${yearOf(3)}-03-05T10:00:00Z`,
    };
    const { fixture } = setup({ payments: [payment] });

    const row = fixture.nativeElement.querySelector('[data-cy="payment-row-3"]');
    expect(row.textContent).toContain('95');
    expect(row.textContent).toContain(`5 March ${yearOf(3)}`);
    expect(fixture.nativeElement.querySelector('[data-cy="payment-period-3"]')).toBeNull();
  });

  it('spreads a period that started last year into this one', () => {
    // December belongs to the SEASON's first calendar year; the January and
    // February it pays for belong to the second. Inside one table.
    const payment: AthletePayment = {
      id: 9,
      athlete_id: 42,
      year: SEASON,
      month: 12,
      period_months: 3,
      amount_cents: 16500,
      paid_at: `${SEASON}-12-05T10:00:00Z`,
    };
    const { fixture } = setup({ payments: [payment] });

    // December's own row is in THIS table now; January and February
    // are what this year sees of it.
    for (const month of [1, 2]) {
      expect(
        fixture.nativeElement.querySelector(`[data-cy="payment-row-${month}"]`).textContent,
        `month ${month}`,
      ).toContain('Paid');
    }
    expect(fixture.nativeElement.querySelector('[data-cy="payment-row-3"]').textContent).toContain(
      'Unpaid',
    );
    // The amount stays on December, which is not in this table at all.
    expect(
      fixture.nativeElement.querySelector('[data-cy="payment-row-1"]').textContent,
    ).not.toContain('165');
  });

  it('treats a payload with no period_months as monthly', () => {
    // Pre-#1382 rows, and every Cypress mock written before it.
    const payment = {
      id: 1,
      athlete_id: 42,
      year: yearOf(3),
      month: 3,
      amount_cents: 9500,
      paid_at: `${yearOf(3)}-03-05T10:00:00Z`,
    } as AthletePayment;
    const { fixture } = setup({ payments: [payment] });

    expect(fixture.nativeElement.querySelector('[data-cy="payment-row-3"]').textContent).toContain(
      'Paid',
    );
    expect(fixture.nativeElement.querySelector('[data-cy="payment-row-4"]').textContent).toContain(
      'Unpaid',
    );
  });
});

describe('PaymentsListComponent — the 422 that is not about the fee (#1382)', () => {
  function toastDetailFor(errors: Record<string, string[]>): string {
    const { fixture, component } = setup({ payments: [] });

    const confirmService = fixture.componentRef.injector.get(ConfirmationService);
    confirmService.confirm = vi.fn((cfg: { accept: () => void }) => {
      cfg.accept();
      return confirmService;
    }) as never;

    const paymentSvc = TestBed.inject(PaymentService);
    (paymentSvc as unknown as { markPaid: Mock }).markPaid = vi.fn(() =>
      throwError(() => ({ status: 422, error: { errors } })),
    );

    const messageSpy = vi.spyOn(fixture.componentRef.injector.get(MessageService), 'add');

    const januaryRow = component['monthRows']()[0];
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', { value: document.createElement('button') });
    component.confirmToggleRow(event, januaryRow);

    return String(messageSpy.mock.calls.at(-1)?.[0]?.detail ?? '');
  }

  it('says the month is already covered, not that no fee is configured', () => {
    // "The academy has not configured a monthly fee" is flatly untrue here —
    // the fee is fine, the month is taken by another period.
    expect(toastDetailFor({ period_months: ['clash'] })).toContain('already covered');
  });

  it('still says what a missing-fee 422 means', () => {
    expect(toastDetailFor({ monthly_fee_cents: ['missing'] })).toContain('monthly fee');
  });

  it('blames the date when the date was refused, not the fee (#1761)', () => {
    // The academy has a fee; "set a monthly fee first" would send the owner
    // to a setting that is already right.
    const detail = toastDetailFor({
      paid_at: ['The paid at field must be a date before or equal to today.'],
    });

    expect(detail).toContain('later than today');
    expect(detail).not.toContain('monthly fee');
  });

  it('says what it knows for a field it has no sentence for, and never blames the fee', () => {
    const detail = toastDetailFor({ payment_method: ['The selected payment method is invalid.'] });

    expect(detail).toContain("wasn't accepted");
    expect(detail).not.toContain('monthly fee');
  });

  // ─── A way to another year (#1636, PAY-1) ────────────────────────────────

  // Frozen in FEBRUARY 2027 on purpose, and consistent with the fixture's
  // `season_start` of 2026-09-01 — a pairing the server can actually produce
  // (`Season::startFor` on this date returns exactly that).
  //
  // February is the month that separates the two rules. The season on screen
  // starts in 2026; the calendar year is 2027. The old rule
  // (`seasonYear() < currentYear`) reads 2026 < 2027 and offers a step into
  // 2027/28, a season that has not begun. The new one compares seasons and
  // refuses. With the clock in June — and a `season_start` the server could
  // never have returned for June — both rules agreed and the fix was pinned
  // by nothing.
  beforeEach(() => vi.setSystemTime(new Date(Date.UTC(2027, 1, 15))));
  afterEach(() => vi.useRealTimers());

  it('walks back a year and refetches that year', () => {
    const { component } = setup({ joinedAt: '2023-04-01' });
    const svc = TestBed.inject(PaymentService) as unknown as { list: Mock };
    const thisYear = component['seasonYear']();

    component['prevYear']();

    expect(component['seasonYear']()).toBe(thisYear - 1);
    // The table has to follow the heading, or the page says one season and
    // shows another. Two requests per load, one per calendar year the season
    // spans (#1709), so the previous season's pair starts at index 2.
    expect(svc.list).toHaveBeenCalledTimes(4);
    expect(svc.list.mock.calls[2][1]).toBe(thisYear - 1);
    expect(svc.list.mock.calls[3][1]).toBe(thisYear);
  });

  it('keeps the payments from BOTH calendar years the season spans', () => {
    // The merge is the reason the load asks twice. Nothing else tested it:
    // a fake that ignores the year returns the same array to both calls, so
    // `pages.flat()` merged a payload with its own duplicate and dropping
    // half the fetch passed the suite (#1709).
    const { component } = setup({
      joinedAt: '2020-01-01',
      payments: [
        {
          id: 1,
          athlete_id: 42,
          year: 2026,
          month: 10,
          amount_cents: 9500,
          paid_at: '2026-10-02T10:00:00Z',
        },
        {
          id: 2,
          athlete_id: 42,
          year: 2027,
          month: 2,
          amount_cents: 9500,
          paid_at: '2027-02-02T10:00:00Z',
        },
      ],
    });

    const rows = component['monthRows']();
    const october = rows.find((r: { month: number }) => r.month === 10)!;
    const february = rows.find((r: { month: number }) => r.month === 2)!;

    // One from each request, both on the same table.
    expect(october.payment?.id).toBe(1);
    expect(february.payment?.id).toBe(2);
  });

  it('stops at the SEASON the athlete joined, which is not their joining year', () => {
    // April 2023 belongs to the season that began in September 2022, so the
    // floor is 2022. Flooring on the joining YEAR stopped at 2023 and put
    // April through August 2023 — months this athlete actually paid for —
    // behind a disabled chevron. On a September academy that hits every
    // joining month from January to August: eight of twelve (#1709).
    const { component } = setup({ joinedAt: '2023-04-01' });
    const thisSeason = component['seasonYear']();

    // Step until it refuses, rather than assume how many seasons back today is.
    for (let i = 0; i < 20 && component['canGoPrev'](); i++) component['prevYear']();
    expect(component['seasonYear']()).toBe(2022);
    expect(component['canGoPrev']()).toBe(false);

    // And the month they joined in is actually on the table it stops at.
    const months = component['monthRows']().map(
      (r: { year: number; month: number }) => `${r.year}-${r.month}`,
    );
    expect(months).toContain('2023-4');

    // The guard, not just the disabled attribute: nothing stops a keyboard
    // or a test calling it again.
    component['prevYear']();
    expect(component['seasonYear']()).toBe(2022);
    expect(thisSeason).toBeGreaterThan(2022);
  });

  it('does not travel into a year that has not happened', () => {
    const { component } = setup({ joinedAt: '2023-04-01' });
    const thisYear = component['seasonYear']();

    expect(component['canGoNext']()).toBe(false);
    component['nextYear']();
    expect(component['seasonYear']()).toBe(thisYear);

    // ...but going back and forward again is fine.
    component['prevYear']();
    expect(component['canGoNext']()).toBe(true);
    component['nextYear']();
    expect(component['seasonYear']()).toBe(thisYear);
  });

  it('leaves every month of a finished year editable', () => {
    const { component } = setup({ joinedAt: '2023-04-01' });

    component['prevYear']();
    const rows = component['monthRows']();
    expect(rows.length).toBe(12);
    expect(rows.every((r: { canEdit: boolean }) => r.canEdit)).toBe(true);
  });

  it('lets the owner record a month paid in advance', () => {
    // The clock is frozen to 15 June, so July onward has not arrived.
    const { component } = setup({ joinedAt: '2023-04-01' });
    const rows = component['monthRows']();

    // #1636 disabled these on the reasoning that there is nothing to mark
    // paid for July in May. Paying a month or a term ahead is ordinary, and
    // the row the money belongs to was the one row the owner could not
    // touch — the server has always accepted it.
    const october = rows.find((r: { month: number }) => r.month === 10);
    expect(october?.canEdit).toBe(true);
    expect(rows.every((r: { canEdit: boolean }) => r.canEdit)).toBe(true);
  });

  it('still refuses every month when the academy has no fee to charge', () => {
    // The negative control the rule now rests on entirely: with the cap gone,
    // `fee` is the only thing left saying no, so a mistake there would make
    // the whole table editable against an academy that charges nothing.
    const { component } = setup({ fee: null });
    expect(component['monthRows']().some((r: { canEdit: boolean }) => r.canEdit)).toBe(false);
  });

  it('survives an athlete payload with no joining date', () => {
    // The fixture had none, and the unguarded read threw inside the
    // subscriber without failing anything.
    const { component } = setup();
    // The read is the first statement of the subscriber, so a throw stops
    // everything after it — this is what makes the regression observable.
    expect(component['athleteName']()).toBe('Mario Rossi');
    expect(component['canGoPrev']()).toBe(true);
    component['prevYear']();
    expect(component['seasonYear']()).toBe(2025);
  });

  // ─── What one period costs (#1636, PAY-4) ────────────────────────────────

  it('names the period and its amount for anyone who does not pay monthly', () => {
    const { component } = setup({ fee: 7000, billingPeriodMonths: 3 });
    const hint = component['billingPeriodHint']();
    expect(hint).not.toBeNull();
    // The period was discoverable only by reading rows, three of which say
    // "Paid · — · 2 January" for one payment.
    expect(hint).toContain('Quarterly');
    expect(hint).toContain('210');
  });

  it('says nothing about a period when the athlete pays monthly', () => {
    const { component } = setup({ fee: 7000, billingPeriodMonths: 1 });
    // The monthly figure above already says everything.
    expect(component['billingPeriodHint']()).toBeNull();
  });

  it("records against the ROW's own year, not the season's", () => {
    // The one that matters, and #1709 made it matter more. It used to prove
    // the year came from the table rather than from today; a season crosses
    // new year, so now it has to come from the ROW — February on a 2026/27
    // table is February 2027, and sending 2026 would silently write the
    // payment onto a month twelve cells above the one that was clicked.
    const { component } = setup({ joinedAt: '2023-04-01' });
    const svc = TestBed.inject(PaymentService) as unknown as { markPaid: Mock };

    const rows = component['monthRows']();
    const october = rows.find((r: { month: number }) => r.month === 10)!;
    const february = rows.find((r: { month: number }) => r.month === 2)!;

    // Same table, two different calendar years.
    expect(october.year).toBe(2026);
    expect(february.year).toBe(2027);

    component['applyToggle'](february.year, february.month, true);
    expect(svc.markPaid).toHaveBeenCalledWith(42, 2027, 2, undefined, {});

    component['applyToggle'](october.year, october.month, true);
    expect(svc.markPaid).toHaveBeenLastCalledWith(42, 2026, 10, undefined, {});
  });

  it('does not leave a year on the heading that the rows are not from', () => {
    // The rows are kept on a failed load (#260) — but keeping them under a
    // heading naming another year is worse than either, because the table is
    // live: unmarking a row would delete a payment from the year named.
    const { component } = setup({ joinedAt: '2023-04-01' });
    const svc = TestBed.inject(PaymentService) as unknown as { list: Mock };
    svc.list = vi.fn(() => throwError(() => ({ status: 500 })));

    component['prevYear']();

    expect(component['seasonYear']()).toBe(2026);
  });

  it('will not step before the earliest year the server accepts', () => {
    // joined_at is only `date`-validated, so a long-standing member can hold
    // 2015 — and the store request refuses anything under 2020, reporting it
    // as "set a monthly fee first".
    const { component } = setup({ joinedAt: '2015-09-01' });
    for (let i = 0; i < 20 && component['canGoPrev'](); i++) component['prevYear']();
    // Season 2019, not calendar 2020: it is the season that CONTAINS January
    // 2020, and stopping at season 2020 would have hidden January through
    // August 2020 — inside the server's window, and unreachable.
    expect(component['seasonYear']()).toBe(2019);
    expect(component['canGoPrev']()).toBe(false);

    // The months of that season that the server would refuse are read-only
    // rather than hidden, so the table stays honest at both ends.
    const rows = component['monthRows']();
    const sept2019 = rows.find((r: { year: number; month: number }) => r.year === 2019)!;
    const jan2020 = rows.find((r: { year: number; month: number }) => r.year === 2020)!;
    expect(sept2019.canEdit).toBe(false);
    expect(jan2020.canEdit).toBe(true);
  });

  it('will not walk into the past when the athlete failed to load', () => {
    const { component } = setup();
    for (let i = 0; i < 20 && component['canGoPrev'](); i++) component['prevYear']();
    // Without a hard floor an unknown joining year walked to 1999. The floor
    // is the season holding the server's earliest acceptable month.
    expect(component['seasonYear']()).toBe(2019);
  });
});

describe('PaymentsListComponent — the ledger stops asserting a debt it cannot know about (#1742)', () => {
  // The academy trained for years before Budojo. Every month before it
  // adopted the app rendered an amber "Non pagato" for fees collected in
  // cash — up to six seasons of them per athlete. Absence of a payment
  // record is not arrears.
  const SEPTEMBER_ACADEMY = { season_start_month: 9, season_start: '2026-09-01' };

  function rowFor(component: PaymentsListComponent, year: number, month: number) {
    return component['monthRows']().find(
      (r: { year: number; month: number }) => r.year === year && r.month === month,
    );
  }

  it('leaves months before the floor blank rather than unpaid', () => {
    // An academy that adopted Budojo in the MIDDLE of a season — the case
    // that actually puts both kinds of month in one table. September to
    // December 2026 are below a January 2027 floor; the rest of the season
    // is above it.
    const { component } = setup({
      academy: SEPTEMBER_ACADEMY,
      joinedAt: '2021-03-15',
      billingFloor: '2027-01-01',
    });

    expect(rowFor(component, 2026, 9)?.beforeBillingFloor).toBe(true);
    expect(rowFor(component, 2026, 12)?.beforeBillingFloor).toBe(true);
    // The floor month itself is IN scope — the first month Budojo can speak
    // for, not the last it cannot.
    expect(rowFor(component, 2027, 1)?.beforeBillingFloor).toBe(false);
    expect(rowFor(component, 2027, 8)?.beforeBillingFloor).toBe(false);
  });

  it('still calls a genuinely unpaid month after the floor unpaid', () => {
    const { component } = setup({
      academy: SEPTEMBER_ACADEMY,
      joinedAt: '2021-03-15',
      billingFloor: '2026-09-01',
    });

    // The floor month itself is IN scope — it is the first month Budojo can
    // speak for, not the last it cannot.
    expect(rowFor(component, 2026, 9)?.beforeBillingFloor).toBe(false);
    expect(rowFor(component, 2027, 2)?.beforeBillingFloor).toBe(false);
  });

  it('behaves exactly as before when nothing floors the athlete', () => {
    const { component } = setup({
      academy: SEPTEMBER_ACADEMY,
      joinedAt: '2021-03-15',
      billingFloor: null,
    });

    // An academy restored from a backup predating #1742 carries no floor.
    // Blanking somebody's whole history would be a worse bug than the one
    // this fixes — and the stepper must still reach the seasons it always did.
    expect(rowFor(component, 2026, 9)?.beforeBillingFloor).toBe(false);
    expect(component['canGoPrev']()).toBe(true);
  });

  it('keeps the month recordable below the floor', () => {
    const { component } = setup({
      academy: SEPTEMBER_ACADEMY,
      joinedAt: '2021-03-15',
      billingFloor: '2027-01-01',
    });

    // A display and aggregation rule, not a write rule: the owner
    // transcribing a paper register is exactly the case that produces a
    // payment below the floor, and the server has always accepted one. The
    // two floors are deliberately not folded together — `canEdit` mirrors
    // the server's `min:2020`, which is a write the API will refuse.
    expect(rowFor(component, 2026, 9)?.beforeBillingFloor).toBe(true);
    expect(rowFor(component, 2026, 9)?.canEdit).toBe(true);
  });

  it('stops the season stepper at the floor, not at the joining season', () => {
    const { component } = setup({
      academy: SEPTEMBER_ACADEMY,
      joinedAt: '2021-03-15',
      billingFloor: '2026-09-01',
    });

    // Without the floor the stepper walked back to season 2020 and offered
    // five seasons of rows the app can say nothing about.
    expect(component['canGoPrev']()).toBe(false);
  });

  it('stops at an earlier floor rather than at the current season', () => {
    const { component } = setup({
      academy: SEPTEMBER_ACADEMY,
      joinedAt: '2021-03-15',
      billingFloor: '2024-03-01',
    });

    // The floor is season 2023/24, so the stepper walks back — but only that
    // far. The previous fixture here put the floor BEFORE the joining month,
    // a state the server cannot emit (`billing_floor` is `max()` of the two),
    // and both the old and new rules answered `true` for it: the assertion
    // could not fail. This one depends on `billingFloorSeason`.
    expect(component['canGoPrev']()).toBe(true);

    component['prevYear']();
    component['prevYear']();
    component['prevYear']();
    component['prevYear']();

    expect(component['seasonLabel']()).toBe('2023/24');
    expect(component['canGoPrev']()).toBe(false);
  });
});

describe('PaymentsListComponent — when the money arrived, and how (#1761)', () => {
  /** Captures what the component asks the popup for, without opening one. */
  function captureConfirm(fixture: ReturnType<typeof setup>['fixture']) {
    const confirmService = fixture.componentRef.injector.get(ConfirmationService);
    const asked: { key?: string; accept: () => void }[] = [];
    confirmService.confirm = vi.fn((cfg: { key?: string; accept: () => void }) => {
      asked.push(cfg);
      return confirmService;
    }) as never;
    return asked;
  }

  function click(): MouseEvent {
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', { value: document.createElement('button') });
    return event;
  }

  it('asks for the date and the method only when marking, not when unmarking', () => {
    const paid: AthletePayment = {
      id: 1,
      athlete_id: 42,
      year: 2027,
      month: 1,
      amount_cents: 9500,
      paid_at: '2027-01-15T00:00:00+00:00',
    };
    const { fixture, component } = setup({ payments: [paid] });
    const asked = captureConfirm(fixture);
    const rows = component['monthRows']();

    component.confirmToggleRow(
      click(),
      rows.find((r: { month: number }) => r.month === 2)!,
    );
    component.confirmToggleRow(
      click(),
      rows.find((r: { month: number }) => r.month === 1)!,
    );

    // The keyed popup is the one with the fields; undoing money needs none.
    expect(asked.map((a) => a.key)).toEqual(['mark-paid', undefined]);
  });

  it('sends the day the money arrived and how it was paid', () => {
    const { fixture, component } = setup();
    const asked = captureConfirm(fixture);
    const svc = TestBed.inject(PaymentService) as unknown as { markPaid: Mock };
    const february = component['monthRows']().find((r: { month: number }) => r.month === 2)!;

    component.confirmToggleRow(click(), february);
    // February paid in advance, by transfer, on 20 September.
    component['markPaidForm'].setValue({
      paid_at: new Date(2026, 8, 20),
      payment_method: 'transfer',
    });
    asked[0].accept();

    // The owner's calendar day, as the day it is — never a UTC instant a
    // timezone could move back to the 19th. February stays the month paid for.
    expect(svc.markPaid).toHaveBeenCalledWith(42, 2027, 2, undefined, {
      paidAt: '2026-09-20',
      method: 'transfer',
    });
  });

  it('opens empty every time, so a date picked for one month never lands on the next', () => {
    const { fixture, component } = setup();
    captureConfirm(fixture);
    const rows = component['monthRows']();

    component.confirmToggleRow(
      click(),
      rows.find((r: { month: number }) => r.month === 2)!,
    );
    component['markPaidForm'].setValue({ paid_at: new Date(2026, 8, 20), payment_method: 'cash' });
    // The owner walks away, then opens March.
    component.confirmToggleRow(
      click(),
      rows.find((r: { month: number }) => r.month === 3)!,
    );

    expect(component['markPaidForm'].getRawValue()).toEqual({
      paid_at: null,
      payment_method: null,
    });
  });

  it('shows how a payment was paid under its date, and nothing when nobody said', () => {
    const { fixture } = setup({
      payments: [
        {
          id: 1,
          athlete_id: 42,
          year: 2027,
          month: 1,
          amount_cents: 9500,
          paid_at: '2027-01-15T00:00:00+00:00',
          payment_method: 'transfer',
        },
        {
          id: 2,
          athlete_id: 42,
          year: 2027,
          month: 2,
          amount_cents: 9500,
          paid_at: '2027-02-10T00:00:00+00:00',
          payment_method: null,
        },
      ],
    });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[data-cy="payment-method-1"]')?.textContent?.trim()).toBe(
      'Bank transfer',
    );
    expect(root.querySelector('[data-cy="payment-method-2"]')).toBeNull();
  });
});
