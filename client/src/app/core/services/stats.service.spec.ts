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

  it('GETs /api/v1/stats/attendance/monthly with default months=12', () => {
    let received: unknown;
    service.attendanceMonthly().subscribe((r) => (received = r));

    const req = http.expectOne('/api/v1/stats/attendance/monthly?months=12');
    expect(req.request.method).toBe('GET');
    req.flush({ data: [{ month: '2026-05', active: 3, paused: 1 }] });

    expect(received).toEqual([{ month: '2026-05', active: 3, paused: 1 }]);
  });

  it('honours a custom months argument', () => {
    service.attendanceMonthly(24).subscribe();
    http.expectOne('/api/v1/stats/attendance/monthly?months=24').flush({ data: [] });
  });
});
