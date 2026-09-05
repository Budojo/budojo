import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MyPaymentsComponent } from './my-payments.component';
import type { AthletePayment } from '../../core/services/payment.service';
import type { Carnet } from '../../core/services/carnet.service';
import { environment } from '../../../environments/environment';
import { provideI18nTesting } from '../../../test-utils/i18n-test';

function payment(over: Partial<AthletePayment> = {}): AthletePayment {
  const year = new Date().getFullYear();
  return {
    id: 1,
    athlete_id: 1,
    year,
    month: 1,
    amount_cents: 5000,
    paid_at: `${year}-01-15T08:00:00Z`,
    ...over,
  };
}

function setup() {
  TestBed.configureTestingModule({
    imports: [MyPaymentsComponent],
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([]),
      ...provideI18nTesting(),
    ],
  });

  const fixture = TestBed.createComponent(MyPaymentsComponent);
  const http = TestBed.inject(HttpTestingController);
  fixture.detectChanges();
  const year = new Date().getFullYear();
  return { fixture, el: fixture.nativeElement as HTMLElement, http, year };
}

describe('MyPaymentsComponent (M7 PR-D slice 4)', () => {
  it('shows the loading skeleton while the request is in flight', () => {
    const { el, http, year } = setup();
    expect(el.querySelector('[data-cy="my-payments-loading"]')).not.toBeNull();
    expect(el.querySelector('[data-cy="my-payments-grid"]')).toBeNull();
    http.expectOne(`${environment.apiBase}/api/v1/me/payments?year=${year}`).flush({ data: [] });
  });

  it('renders 12 month rows even when zero payments are returned', () => {
    const { fixture, el, http, year } = setup();
    http.expectOne(`${environment.apiBase}/api/v1/me/payments?year=${year}`).flush({ data: [] });
    fixture.detectChanges();

    const rows = el.querySelectorAll('[data-cy^="month-"]');
    expect(rows.length).toBe(12);
    expect(el.querySelector('[data-cy="month-1"] .my-payments__unpaid')).not.toBeNull();
  });

  it('marks paid months with the amount and the paid-on date', () => {
    const { fixture, el, http, year } = setup();
    http.expectOne(`${environment.apiBase}/api/v1/me/payments?year=${year}`).flush({
      data: [payment({ month: 1, amount_cents: 7500 })],
    });
    fixture.detectChanges();

    const row = el.querySelector('[data-cy="month-1"]');
    expect(row?.classList.contains('my-payments__row--paid')).toBe(true);
    expect(row?.textContent).toContain('75');
    // Other months stay unpaid.
    expect(el.querySelector('[data-cy="month-2"] .my-payments__unpaid')).not.toBeNull();
  });

  it('renders the no-profile state on 404', () => {
    const { fixture, el, http, year } = setup();
    http
      .expectOne(`${environment.apiBase}/api/v1/me/payments?year=${year}`)
      .flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(el.querySelector('[data-cy="my-payments-no-profile"]')).not.toBeNull();
  });

  it('renders the error state on 500', () => {
    const { fixture, el, http, year } = setup();
    http
      .expectOne(`${environment.apiBase}/api/v1/me/payments?year=${year}`)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el.querySelector('[data-cy="my-payments-error"]')).not.toBeNull();
  });

  // ─── Carnet balance card (#1364) ───────────────────────────────────────────

  function carnet(over: Partial<Carnet> = {}): Carnet {
    return {
      id: 1,
      code: 'A7K2',
      athlete_id: 1,
      total_entries: 10,
      remaining_entries: 6,
      price_cents: 7000,
      purchased_at: '2026-01-10',
      expires_at: '2027-01-10',
      is_active: true,
      ...over,
    };
  }

  function flushCarnets(http: HttpTestingController, body: Carnet[]): void {
    http.expectOne(`${environment.apiBase}/api/v1/me/carnets`).flush({ data: body });
  }

  it('shows the athlete their own remaining entries', () => {
    const { fixture, el, http } = setup();
    flushCarnets(http, [carnet()]);
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="my-carnet-code"]')?.textContent?.trim()).toBe('A7K2');
    expect(el.querySelector('[data-cy="my-carnet-remaining"]')?.textContent?.trim()).toBe('6');
  });

  it('shows no carnet card when the athlete holds none', () => {
    const { fixture, el, http } = setup();
    flushCarnets(http, []);
    fixture.detectChanges();

    // An academy that doesn't sell carnets should show no trace of the concept.
    expect(el.querySelector('[data-cy="my-carnet-card"]')).toBeNull();
  });

  it('shows no carnet card when every carnet is spent or expired', () => {
    const { fixture, el, http } = setup();
    flushCarnets(http, [carnet({ is_active: false, remaining_entries: 0 })]);
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="my-carnet-card"]')).toBeNull();
  });

  it('picks the carnet expiring soonest, matching what the next session spends', () => {
    const { fixture, el, http } = setup();
    flushCarnets(http, [
      carnet({ id: 9, code: 'NEWER', expires_at: '2027-06-01' }),
      carnet({ id: 4, code: 'SOONER', expires_at: '2026-11-01' }),
    ]);
    fixture.detectChanges();

    expect(el.querySelector('[data-cy="my-carnet-code"]')?.textContent?.trim()).toBe('SOONER');
  });

  it('still renders the payments grid when the carnet request fails', () => {
    const { fixture, el, http, year } = setup();
    http
      .expectOne(`${environment.apiBase}/api/v1/me/carnets`)
      .error(new ProgressEvent('error'), { status: 500, statusText: 'Server Error' });
    http.expectOne(`${environment.apiBase}/api/v1/me/payments?year=${year}`).flush({ data: [] });
    fixture.detectChanges();

    // The monthly ledger is the page's main job; a carnet failure hides the
    // card, it does not take the page down with it.
    expect(el.querySelector('[data-cy="my-carnet-card"]')).toBeNull();
    expect(el.querySelector('[data-cy="my-payments-grid"]')).not.toBeNull();
  });
});
