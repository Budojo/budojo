import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import type { Mock } from 'vitest';
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

class FakeAthleteService {
  readonly get = vi.fn(() =>
    of({
      id: 42,
      first_name: 'Mario',
      last_name: 'Rossi',
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

function setup(opts: { fee?: number | null; payments?: AthletePayment[] } = {}) {
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
    ],
  });

  TestBed.inject(AcademyService).academy.set({
    ...ACADEMY_BASE,
    monthly_fee_cents: opts.fee === undefined ? 9500 : opts.fee,
  });

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
