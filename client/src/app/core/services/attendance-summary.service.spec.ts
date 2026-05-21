import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AttendanceSummary, AttendanceSummaryService } from './attendance-summary.service';

describe('AttendanceSummaryService (#894)', () => {
  let svc: AttendanceSummaryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(AttendanceSummaryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function makePayload(overrides: Partial<AttendanceSummary> = {}): AttendanceSummary {
    return {
      range_days: 90,
      range_start: '2026-02-20',
      range_end: '2026-05-20',
      attended_count: 3,
      expected_count: 4,
      rate: 0.75,
      series: [
        { date: '2026-03-01', attended: true },
        { date: '2026-03-15', attended: true },
        { date: '2026-04-01', attended: true },
        { date: '2026-04-15', attended: false },
      ],
      ...overrides,
    };
  }

  it('GETs /athletes/:id/attendance/summary?range=90 by default and unwraps data', async () => {
    // Subscribe BEFORE expectOne — `http.get()` is a cold Observable
    // and the request doesn't enter the testing backend until a
    // subscriber is attached.
    const expected = makePayload();
    let resolved: AttendanceSummary | null = null;
    svc.fetch(42).subscribe((r) => (resolved = r));

    const req = http.expectOne((r) => {
      return r.url === '/api/v1/athletes/42/attendance/summary' && r.params.get('range') === '90';
    });
    expect(req.request.method).toBe('GET');
    req.flush({ data: expected });

    expect(resolved).toEqual(expected);
  });

  it.each([30, 90, 365] as const)('forwards range=%i as the query param', (range) => {
    svc.fetch(7, range).subscribe();
    const req = http.expectOne(
      (r) =>
        r.url === '/api/v1/athletes/7/attendance/summary' &&
        r.params.get('range') === String(range),
    );
    req.flush({ data: makePayload({ range_days: range }) });
  });

  it('passes rate=null through (no shape coercion to 0)', () => {
    const payload = makePayload({ rate: null, attended_count: 0, expected_count: 0, series: [] });
    let resolved: AttendanceSummary | null = null;
    svc.fetch(42).subscribe((r) => (resolved = r));

    http.expectOne('/api/v1/athletes/42/attendance/summary?range=90').flush({ data: payload });

    expect(resolved!.rate).toBeNull();
  });
});
