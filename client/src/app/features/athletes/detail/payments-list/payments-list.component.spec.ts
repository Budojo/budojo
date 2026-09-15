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

class FakePaymentService {
  readonly list = vi.fn(() => of([] as AthletePayment[]));
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
      monthly_fee_cents: opts.feeTier ? opts.feeTier.amount_cents : fee,
      fee_tier: opts.feeTier ?? null,
      // Undefined unless a test says otherwise — that is how the fixture was,
      // and reading it unguarded threw 16 unhandled rxjs errors without
      // failing a single test (#1636).
      joined_at: opts.joinedAt,
      billing_period_months: opts.billingPeriodMonths,
    }),
  );

  if (opts.payments) {
    const svc = TestBed.inject(PaymentService) as unknown as { list: Mock };
    svc.list = vi.fn(() => of(opts.payments!));
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
    expect(markSpy.mock.calls[0]).toEqual([42, 2027, 2]);
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

  it('captions every covered month with the range the payment buys', () => {
    const { fixture } = setup({ payments: [quarterlyFrom(2)] });

    for (const month of [2, 3, 4]) {
      const caption = fixture.nativeElement.querySelector(`[data-cy="payment-period-${month}"]`);
      expect(caption, `month ${month}`).not.toBeNull();
      expect(caption.textContent).toContain('February');
      expect(caption.textContent).toContain('April');
    }
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

  // ─── A way to another year (#1636, PAY-1) ────────────────────────────────

  // Frozen mid-year on purpose: these read the wall clock, and a test whose
  // power swings with the calendar is not a test.
  beforeEach(() => vi.setSystemTime(new Date(Date.UTC(2026, 5, 15))));
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

  it('stops at the year the athlete joined', () => {
    const { component } = setup({ joinedAt: '2023-04-01' });
    const thisYear = component['seasonYear']();

    // Step until it refuses, rather than assume how many years back today is.
    for (let i = 0; i < 20 && component['canGoPrev'](); i++) component['prevYear']();
    expect(component['seasonYear']()).toBe(2023);
    expect(component['canGoPrev']()).toBe(false);

    // The guard, not just the disabled attribute: nothing stops a keyboard
    // or a test calling it again.
    component['prevYear']();
    expect(component['seasonYear']()).toBe(2023);
    expect(thisYear).toBeGreaterThan(2023);
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
    expect(svc.markPaid).toHaveBeenCalledWith(42, 2027, 2);

    component['applyToggle'](october.year, october.month, true);
    expect(svc.markPaid).toHaveBeenLastCalledWith(42, 2026, 10);
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
    expect(component['seasonYear']()).toBe(2020);
    expect(component['canGoPrev']()).toBe(false);
  });

  it('will not walk into the past when the athlete failed to load', () => {
    const { component } = setup();
    for (let i = 0; i < 20 && component['canGoPrev'](); i++) component['prevYear']();
    // Without a hard floor an unknown joining year walked to 1999.
    expect(component['seasonYear']()).toBe(2020);
  });
});
