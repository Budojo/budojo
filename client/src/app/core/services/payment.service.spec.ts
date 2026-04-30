import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PaymentService, AthletePayment } from './payment.service';
import { environment } from '../../../environments/environment';

describe('PaymentService (#182)', () => {
  let service: PaymentService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiBase}/api/v1/athletes`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PaymentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('markPaid POSTs {year, month} to /athletes/{id}/payments and unwraps data', () => {
    const expected: AthletePayment = {
      id: 99,
      athlete_id: 42,
      year: 2026,
      month: 4,
      amount_cents: 9500,
      paid_at: '2026-04-30T08:00:00Z',
    };

    let actual: AthletePayment | null = null;
    service.markPaid(42, 2026, 4).subscribe((p) => (actual = p));

    const req = httpMock.expectOne(`${base}/42/payments`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ year: 2026, month: 4 });
    req.flush({ data: expected });

    expect(actual).toEqual(expected);
  });

  it('unmarkPaid DELETEs /athletes/{id}/payments/{year}/{month} and emits void on 204', () => {
    let completed = false;
    service.unmarkPaid(42, 2026, 4).subscribe({ complete: () => (completed = true) });

    const req = httpMock.expectOne(`${base}/42/payments/2026/4`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(completed).toBe(true);
  });
});
