import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { provideI18nTesting } from '../../../../../test-utils/i18n-test';
import { Athlete } from '../../../../core/services/athlete.service';
import { CheckInMoney } from './check-in-money';
import { PayRecorded, PaySheetComponent } from './pay-sheet.component';

const athlete = (over: Partial<Athlete> = {}): Athlete =>
  ({
    id: 7,
    first_name: 'Anna',
    last_name: 'Bianchi',
    belt: 'blue',
    stripes: 1,
    status: 'active',
    is_self: false,
    date_of_birth: null,
    photo_url: null,
    user_avatar_url: null,
    monthly_fee_cents: 6000,
    billing_period_months: 1,
    billing_floor: '2025-01-01',
    payment_coverage: 'none',
    paid_current_month: false,
    ...over,
  }) as Athlete;

function setup() {
  TestBed.configureTestingModule({
    imports: [PaySheetComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideNoopAnimations(),
      provideRouter([]),
      ...provideI18nTesting(),
      CheckInMoney,
    ],
  });
  const http = TestBed.inject(HttpTestingController);
  const money = TestBed.inject(CheckInMoney);
  money.load();
  http
    .expectOne((r) => r.url.endsWith('/stats/payments/arrears'))
    .flush({
      data: [
        {
          athlete: { id: 7, first_name: 'Anna', last_name: 'Bianchi' },
          months_behind: 1,
          first_unpaid: '2026-08',
          owed_cents: 6000,
        },
      ],
    });
  const fixture = TestBed.createComponent(PaySheetComponent);
  const recorded: PayRecorded[] = [];
  fixture.componentInstance.recorded.subscribe((r) => recorded.push(r));
  let closed = 0;
  fixture.componentInstance.closed.subscribe(() => closed++);
  return { fixture, http, recorded, closed: () => closed };
}

function open(fixture: ReturnType<typeof setup>['fixture'], who: Athlete, month: string): void {
  fixture.componentRef.setInput('athlete', who);
  fixture.componentRef.setInput('month', month);
  fixture.detectChanges();
}

/** The dialog's panel, which PrimeNG renders only while the sheet is open. */
const sheet = (): HTMLElement | null => document.body.querySelector('.p-dialog');
const recordButton = (): HTMLButtonElement =>
  document.body.querySelector('[data-cy="pay-sheet-record"] button') as HTMLButtonElement;
const radio = (month: string): HTMLInputElement =>
  document.body.querySelector(`[data-cy="pay-sheet-month-${month}"] input`) as HTMLInputElement;

describe('PaySheetComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 19, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.inject(HttpTestingController).verify();
  });

  it('stays closed without an athlete', () => {
    const { fixture } = setup();
    fixture.detectChanges();
    expect(sheet()).toBeNull();
  });

  it('lists the months owed, oldest first, with the chip month picked', async () => {
    const { fixture, http } = setup();
    open(fixture, athlete(), '2026-09');
    expect(document.body.querySelector('[data-cy="pay-sheet-loading"]')).not.toBeNull();

    http
      .expectOne((r) => r.url.endsWith('/athletes/7/payments'))
      .flush({ data: [], overdue_months: ['2026-08', '2026-09'] });
    fixture.detectChanges();
    await fixture.whenStable();

    const months = Array.from(document.body.querySelectorAll('[data-cy^="pay-sheet-month-"]')).map(
      (el) => el.textContent?.trim(),
    );
    expect(months).toEqual(['August', 'September', 'October']);
    expect(radio('2026-09').checked).toBe(true);
    expect(recordButton().textContent).toContain('Record €60.00 · cash');
  });

  it('records the picked month in cash and hands the payment back', async () => {
    const { fixture, http, recorded } = setup();
    open(fixture, athlete(), '2026-08');
    http
      .expectOne((r) => r.url.endsWith('/athletes/7/payments'))
      .flush({ data: [], overdue_months: ['2026-08'] });
    fixture.detectChanges();
    await fixture.whenStable();

    recordButton().click();
    const post = http.expectOne((r) => r.method === 'POST');
    expect(post.request.body).toEqual({
      year: 2026,
      month: 8,
      period_months: 1,
      payment_method: 'cash',
    });
    const paid = {
      id: 3,
      athlete_id: 7,
      year: 2026,
      month: 8,
      period_months: 1,
      amount_cents: 6000,
      paid_at: '2026-10-03',
      payment_method: 'cash' as const,
    };
    post.flush({ data: paid }, { status: 201, statusText: 'Created' });

    expect(recorded).toHaveLength(1);
    expect(recorded[0].payment).toEqual(paid);
    expect(recorded[0].created).toBe(true);
  });

  it('cannot be dismissed while the payment is on its way', async () => {
    const { fixture, http } = setup();
    open(fixture, athlete(), '2026-08');
    http
      .expectOne((r) => r.url.endsWith('/athletes/7/payments'))
      .flush({ data: [], overdue_months: ['2026-08'] });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.body.querySelector('.p-dialog-close-button')).not.toBeNull();

    recordButton().click();
    fixture.detectChanges();
    expect(document.body.querySelector('.p-dialog-close-button')).toBeNull();

    http
      .expectOne((r) => r.method === 'POST')
      .flush({ message: 'x' }, { status: 500, statusText: 'x' });
    fixture.detectChanges();
    expect(document.body.querySelector('.p-dialog-close-button')).not.toBeNull();
  });

  it("names a quarterly payer's whole period and its price", async () => {
    const { fixture, http } = setup();
    open(fixture, athlete({ billing_period_months: 3 }), '2026-08');
    http
      .expectOne((r) => r.url.endsWith('/athletes/7/payments'))
      .flush({ data: [], overdue_months: ['2026-08'] });
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      document.body.querySelector('[data-cy="pay-sheet-month-2026-08"]')?.textContent?.trim(),
    ).toBe('August – October');
    expect(recordButton().textContent).toContain('€180.00');
  });

  it('offers a quarterly payer behind two months one quarter, not three', async () => {
    const { fixture, http } = setup();
    open(fixture, athlete({ billing_period_months: 3 }), '2026-08');
    http
      .expectOne((r) => r.url.endsWith('/athletes/7/payments'))
      .flush({ data: [], overdue_months: ['2026-08', '2026-09'] });
    fixture.detectChanges();
    await fixture.whenStable();

    const months = Array.from(document.body.querySelectorAll('[data-cy^="pay-sheet-month-"]')).map(
      (el) => el.textContent?.trim(),
    );
    expect(months).toEqual(['August – October']);
  });

  it('says so when the payment does not go through, and keeps the sheet open', async () => {
    const { fixture, http, recorded } = setup();
    open(fixture, athlete(), '2026-08');
    http
      .expectOne((r) => r.url.endsWith('/athletes/7/payments'))
      .flush({ data: [], overdue_months: ['2026-08'] });
    fixture.detectChanges();
    await fixture.whenStable();

    recordButton().click();
    http
      .expectOne((r) => r.method === 'POST')
      .flush({ message: 'x' }, { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();

    expect(recorded).toHaveLength(0);
    expect(document.body.querySelector('[data-cy="pay-sheet-error"]')).not.toBeNull();
    expect(sheet()).not.toBeNull();
  });

  it('drops a late answer for an athlete the sheet has left', async () => {
    const { fixture, http } = setup();
    open(fixture, athlete(), '2026-08');
    const late = http.expectOne((r) => r.url.endsWith('/athletes/7/payments'));

    // Bruno is behind on nothing: his months need no request.
    open(fixture, athlete({ id: 8, first_name: 'Bruno' }), '2026-10');
    late.flush({ data: [], overdue_months: ['2026-08'] });
    fixture.detectChanges();
    await fixture.whenStable();

    const months = Array.from(document.body.querySelectorAll('[data-cy^="pay-sheet-month-"]')).map(
      (el) => el.getAttribute('data-cy'),
    );
    expect(months).toEqual(['pay-sheet-month-2026-10']);
  });
});
