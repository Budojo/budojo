import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { MyPaymentsComponent } from './my-payments.component';
import type { AthletePayment } from '../../core/services/payment.service';
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
});
