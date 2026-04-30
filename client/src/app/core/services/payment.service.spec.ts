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
    let nextCalled = false;
    service
      .unmarkPaid(42, 2026, 4)
      .subscribe({ next: () => (nextCalled = true), complete: () => (completed = true) });

    const req = httpMock.expectOne(`${base}/42/payments/2026/4`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(nextCalled).toBe(true);
    expect(completed).toBe(true);
  });

  it('unmarkPaid swallows a 404 and emits success (idempotent — already-unpaid is the desired end state)', () => {
    // Symmetric to the server-side POST idempotency: a double-click race
    // or a stale list shouldn't surface a "Couldn't update" toast on a
    // state the user already wanted. The catchError(404) path emits one
    // undefined value via `of(undefined)` so the subscriber's `next`
    // still fires (without it, the optimistic flip in the caller would
    // be skipped). Other status codes propagate as errors.
    let nextCalled = false;
    let errorReceived: unknown = null;
    service.unmarkPaid(42, 2026, 4).subscribe({
      next: () => (nextCalled = true),
      error: (e) => (errorReceived = e),
    });

    const req = httpMock.expectOne(`${base}/42/payments/2026/4`);
    req.flush(null, { status: 404, statusText: 'Not Found' });

    expect(nextCalled).toBe(true);
    expect(errorReceived).toBeNull();
  });

  it('unmarkPaid propagates non-404 errors (e.g. 500) to the caller', () => {
    let errorStatus: number | null = null;
    service.unmarkPaid(42, 2026, 4).subscribe({
      error: (e: { status: number }) => (errorStatus = e.status),
    });

    const req = httpMock.expectOne(`${base}/42/payments/2026/4`);
    req.flush(null, { status: 500, statusText: 'Internal Server Error' });

    expect(errorStatus).toBe(500);
  });
});
