import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AttendanceRecord, AttendanceService, AttendanceSummaryRow } from './attendance.service';

function makeRecord(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: 1,
    athlete_id: 1,
    attended_on: '2026-04-24',
    notes: null,
    source: 'instructor',
    created_at: '2026-04-24T10:00:00+00:00',
    deleted_at: null,
    ...overrides,
  };
}

describe('AttendanceService', () => {
  let service: AttendanceService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AttendanceService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AttendanceService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  describe('getDaily', () => {
    it('GETs /attendance with date param and unwraps the data envelope', () => {
      let received: AttendanceRecord[] | undefined;
      service.getDaily('2026-04-24').subscribe((r) => (received = r));

      const req = httpMock.expectOne((r) => r.url === '/api/v1/attendance');
      expect(req.request.method).toBe('GET');
      expect(req.request.params.get('date')).toBe('2026-04-24');
      expect(req.request.params.has('trashed')).toBe(false);
      req.flush({ data: [makeRecord()] });

      expect(received).toEqual([makeRecord()]);
    });

    it('passes ?trashed=1 when caller opts in', () => {
      service.getDaily('2026-04-24', { trashed: true }).subscribe();
      const req = httpMock.expectOne((r) => r.url === '/api/v1/attendance');
      expect(req.request.params.get('trashed')).toBe('1');
      req.flush({ data: [] });
    });
  });

  describe('markBulk', () => {
    it('POSTs the date + athlete_ids body and unwraps the records list', () => {
      const created = [
        makeRecord({ id: 7, athlete_id: 42 }),
        makeRecord({ id: 8, athlete_id: 99 }),
      ];
      let received: AttendanceRecord[] | undefined;

      service
        .markBulk({ date: '2026-04-24', athlete_ids: [42, 99] })
        .subscribe((r) => (received = r));

      const req = httpMock.expectOne('/api/v1/attendance');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ date: '2026-04-24', athlete_ids: [42, 99] });
      req.flush({ data: created });

      expect(received).toEqual(created);
    });
  });

  describe('delete', () => {
    it('DELETEs the singular record path', () => {
      service.delete(7).subscribe();
      const req = httpMock.expectOne('/api/v1/attendance/7');
      expect(req.request.method).toBe('DELETE');
      req.flush(null);
    });
  });

  describe('getAthleteHistory', () => {
    it('GETs /athletes/{id}/attendance and supports optional from/to', () => {
      service.getAthleteHistory(42, { from: '2026-04-01', to: '2026-04-30' }).subscribe();

      const req = httpMock.expectOne((r) => r.url === '/api/v1/athletes/42/attendance');
      expect(req.request.params.get('from')).toBe('2026-04-01');
      expect(req.request.params.get('to')).toBe('2026-04-30');
      req.flush({ data: [] });
    });

    it('omits query params when range bounds are not provided', () => {
      service.getAthleteHistory(42).subscribe();
      const req = httpMock.expectOne((r) => r.url === '/api/v1/athletes/42/attendance');
      expect(req.request.params.has('from')).toBe(false);
      expect(req.request.params.has('to')).toBe(false);
      req.flush({ data: [] });
    });
  });

  describe('getMonthlySummary', () => {
    it('GETs /attendance/summary with the month param and unwraps rows', () => {
      const rows: AttendanceSummaryRow[] = [
        { athlete_id: 1, first_name: 'Mario', last_name: 'Rossi', count: 12 },
      ];
      let received: AttendanceSummaryRow[] | undefined;

      service.getMonthlySummary('2026-04').subscribe((r) => (received = r));

      const req = httpMock.expectOne((r) => r.url === '/api/v1/attendance/summary');
      expect(req.request.params.get('month')).toBe('2026-04');
      req.flush({ data: rows });

      expect(received).toEqual(rows);
    });
  });

  // ─── Self-mark (#960) ─────────────────────────────────────────

  describe('markToday', () => {
    it('POSTs /me/attendance/today and resolves to status:marked on 201', () => {
      let result: unknown;
      service.markToday().subscribe((r) => (result = r));
      const req = httpMock.expectOne('/api/v1/me/attendance/today');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ data: makeRecord({ source: 'self' }) }, { status: 201, statusText: 'Created' });
      expect(result).toEqual({ status: 'marked', record: makeRecord({ source: 'self' }) });
    });

    it('200 (idempotent re-call) also resolves to status:marked with the existing row', () => {
      let result: unknown;
      service.markToday().subscribe((r) => (result = r));
      httpMock
        .expectOne('/api/v1/me/attendance/today')
        .flush({ data: makeRecord({ source: 'instructor' }) }, { status: 200, statusText: 'OK' });
      expect(result).toEqual({ status: 'marked', record: makeRecord({ source: 'instructor' }) });
    });

    it('422 (not training day) collapses to status:not-training-day', () => {
      let result: unknown;
      service.markToday().subscribe((r) => (result = r));
      httpMock
        .expectOne('/api/v1/me/attendance/today')
        .flush(
          { message: 'Not a training day today.' },
          { status: 422, statusText: 'Unprocessable Entity' },
        );
      expect(result).toEqual({ status: 'not-training-day' });
    });

    it('404 (no athlete) collapses to status:no-athlete', () => {
      let result: unknown;
      service.markToday().subscribe((r) => (result = r));
      httpMock
        .expectOne('/api/v1/me/attendance/today')
        .flush({ message: 'No athlete profile found.' }, { status: 404, statusText: 'Not Found' });
      expect(result).toEqual({ status: 'no-athlete' });
    });

    it('lets a 500 propagate to the error handler (caller decides)', () => {
      let errored = false;
      service.markToday().subscribe({ error: () => (errored = true) });
      httpMock
        .expectOne('/api/v1/me/attendance/today')
        .flush({}, { status: 500, statusText: 'Server Error' });
      expect(errored).toBe(true);
    });
  });

  describe('getTodayPeers (#958)', () => {
    it('GETs /me/attendance/today/peers and unwraps data', () => {
      let result: unknown;
      service.getTodayPeers().subscribe((r) => (result = r));
      const req = httpMock.expectOne('/api/v1/me/attendance/today/peers');
      expect(req.request.method).toBe('GET');
      const peers = [
        {
          id: 1,
          first_name: 'Mario',
          last_name_initial: 'R',
          handle: 'mariobjj',
          belt: 'blue',
          avatar_url: null,
        },
      ];
      req.flush({ data: peers });
      expect(result).toEqual(peers);
    });

    it('returns null on 404 (no athlete row) instead of erroring', () => {
      let result: unknown;
      service.getTodayPeers().subscribe((r) => (result = r));
      httpMock
        .expectOne('/api/v1/me/attendance/today/peers')
        .flush({ message: 'No athlete profile found.' }, { status: 404, statusText: 'Not Found' });
      expect(result).toBeNull();
    });

    it('lets a 500 propagate to the error handler', () => {
      let errored = false;
      service.getTodayPeers().subscribe({ error: () => (errored = true) });
      httpMock
        .expectOne('/api/v1/me/attendance/today/peers')
        .flush({}, { status: 500, statusText: 'Server Error' });
      expect(errored).toBe(true);
    });
  });

  describe('unmarkToday', () => {
    it('DELETEs /me/attendance/today and resolves to status:unmarked on 204', () => {
      let result: unknown;
      service.unmarkToday().subscribe((r) => (result = r));
      const req = httpMock.expectOne('/api/v1/me/attendance/today');
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect(result).toEqual({ status: 'unmarked' });
    });

    it('403 (instructor-marked row) collapses to status:instructor-locked', () => {
      let result: unknown;
      service.unmarkToday().subscribe((r) => (result = r));
      httpMock
        .expectOne('/api/v1/me/attendance/today')
        .flush(
          { message: 'Cannot revert an instructor-marked attendance.' },
          { status: 403, statusText: 'Forbidden' },
        );
      expect(result).toEqual({ status: 'instructor-locked' });
    });

    it('404 collapses to status:no-athlete', () => {
      let result: unknown;
      service.unmarkToday().subscribe((r) => (result = r));
      httpMock
        .expectOne('/api/v1/me/attendance/today')
        .flush({ message: 'No athlete profile found.' }, { status: 404, statusText: 'Not Found' });
      expect(result).toEqual({ status: 'no-athlete' });
    });
  });
});
