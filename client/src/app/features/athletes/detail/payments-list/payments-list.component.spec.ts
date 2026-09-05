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
      year: 2026,
      month: 3,
      amount_cents: 9500,
      paid_at: '2026-03-05T10:00:00Z',
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
} as const;

function setup(
  opts: {
    fee?: number | null;
    feeTier?: { id: number; label: string; amount_cents: number; lessons_per_week: number } | null;
    payments?: AthletePayment[];
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
  TestBed.inject(AcademyService).academy.set({ ...ACADEMY_BASE, monthly_fee_cents: fee });

  const athleteSvc = TestBed.inject(AthleteService) as unknown as { get: Mock };
  athleteSvc.get = vi.fn(() =>
    of({
      id: 42,
      first_name: 'Mario',
      last_name: 'Rossi',
      monthly_fee_cents: opts.feeTier ? opts.feeTier.amount_cents : fee,
      fee_tier: opts.feeTier ?? null,
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
  it('loads payments for the current UTC year on init', () => {
    const { component } = setup();
    const svc = TestBed.inject(PaymentService) as unknown as { list: Mock };

    expect(svc.list).toHaveBeenCalledTimes(1);
    expect(svc.list.mock.calls[0][0]).toBe(42);
    // Year is whatever UTC says today — assert it's in a sane window.
    const year = svc.list.mock.calls[0][1];
    expect(year).toBeGreaterThanOrEqual(2025);
    expect(year).toBeLessThanOrEqual(2100);
    expect(component['athleteName']()).toBe('Mario Rossi');
  });

  it('renders 12 month rows in the calendar order', () => {
    const { fixture } = setup();

    const rows = fixture.nativeElement.querySelectorAll('[data-cy^="payment-row-"]');
    expect(rows.length).toBe(12);

    // First row is January (month=1), last is December (month=12).
    expect(rows[0].getAttribute('data-cy')).toBe('payment-row-1');
    expect(rows[11].getAttribute('data-cy')).toBe('payment-row-12');
  });

  it('renders Paid badge + amount + date on rows that have a payment', () => {
    const payment: AthletePayment = {
      id: 1,
      athlete_id: 42,
      year: 2026,
      month: 3,
      amount_cents: 9500,
      paid_at: '2026-03-05T10:00:00Z',
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
    // Calendar date prefix only — no timezone shift.
    expect(marchRow.textContent).toContain('2026-03-05');
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
      year: 2026,
      month: 1,
      amount_cents: 9500,
      paid_at: '2026-01-15T10:00:00Z',
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

    // Pick an editable unpaid month — January is paid, so use February (paid: null).
    const februaryRow = component['monthRows']()[1];
    expect(februaryRow.month).toBe(2);
    expect(februaryRow.payment).toBeNull();

    const event = new MouseEvent('click');
    Object.defineProperty(event, 'currentTarget', { value: document.createElement('button') });

    component.confirmToggleRow(event, februaryRow);

    expect(markSpy).toHaveBeenCalledTimes(1);
    expect(markSpy.mock.calls[0]).toEqual([42, expect.any(Number), 2]);
    // After success the table reloads — list called once on init + once
    // on the post-success reload.
    expect(listSpy).toHaveBeenCalledTimes(2);
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
  const YEAR = new Date().getUTCFullYear();

  function quarterlyFrom(month: number): AthletePayment {
    return {
      id: 7,
      athlete_id: 42,
      year: YEAR,
      month,
      period_months: 3,
      amount_cents: 16500,
      paid_at: `${YEAR}-0${month}-05T10:00:00Z`,
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
      year: YEAR,
      month: 3,
      period_months: 1,
      amount_cents: 9500,
      paid_at: `${YEAR}-03-05T10:00:00Z`,
    };
    const { fixture } = setup({ payments: [payment] });

    const row = fixture.nativeElement.querySelector('[data-cy="payment-row-3"]');
    expect(row.textContent).toContain('95');
    expect(row.textContent).toContain(`${YEAR}-03-05`);
    expect(fixture.nativeElement.querySelector('[data-cy="payment-period-3"]')).toBeNull();
  });

  it('spreads a period that started last year into this one', () => {
    const payment: AthletePayment = {
      id: 9,
      athlete_id: 42,
      year: YEAR - 1,
      month: 12,
      period_months: 3,
      amount_cents: 16500,
      paid_at: `${YEAR - 1}-12-05T10:00:00Z`,
    };
    const { fixture } = setup({ payments: [payment] });

    // December's own row belongs to last year's table; January and February
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
      year: YEAR,
      month: 3,
      amount_cents: 9500,
      paid_at: `${YEAR}-03-05T10:00:00Z`,
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
});
