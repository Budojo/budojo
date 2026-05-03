import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StatsService } from './stats.service';

describe('StatsService', () => {
  let service: StatsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [StatsService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(StatsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GETs /api/v1/stats/attendance/daily with default months=3', () => {
    let received: unknown;
    service.attendanceDaily().subscribe((r) => (received = r));

    const req = http.expectOne('/api/v1/stats/attendance/daily?months=3');
    expect(req.request.method).toBe('GET');
    req.flush({ data: [{ date: '2026-05-01', count: 4 }] });

    expect(received).toEqual([{ date: '2026-05-01', count: 4 }]);
  });

  it('honours months=12 (max range)', () => {
    service.attendanceDaily(12).subscribe();
    http.expectOne('/api/v1/stats/attendance/daily?months=12').flush({ data: [] });
  });

  it('GETs /api/v1/stats/payments/monthly', () => {
    let received: unknown;
    service.paymentsMonthly().subscribe((r) => (received = r));
    const req = http.expectOne('/api/v1/stats/payments/monthly?months=12');
    expect(req.request.method).toBe('GET');
    req.flush({ data: [{ month: '2026-05', currency: 'EUR', amount_cents: 50000 }] });
    expect(received).toEqual([{ month: '2026-05', currency: 'EUR', amount_cents: 50000 }]);
  });

  it('honours months param in paymentsMonthly()', () => {
    service.paymentsMonthly(6).subscribe();
    http.expectOne('/api/v1/stats/payments/monthly?months=6').flush({ data: [] });
  });
});
