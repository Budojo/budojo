import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WeeklyRecapService } from './weekly-recap.service';

describe('WeeklyRecapService (#960)', () => {
  let svc: WeeklyRecapService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(WeeklyRecapService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GETs /me/recap with the week query param and resolves status:ok', () => {
    let result: unknown;
    svc.getRecap('2026-05-18').subscribe((r) => (result = r));

    const req = http.expectOne((r) => r.url === '/api/v1/me/recap');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('week')).toBe('2026-05-18');

    const data = {
      iso_week_start: '2026-05-18',
      sessions: 3,
      hours: 4.5,
      partners: [{ first_name: 'Mario', last_name_initial: 'R' }],
    };
    req.flush({ data });

    expect(result).toEqual({ status: 'ok', recap: data });
  });

  it('404 (no athlete) collapses to status:no-athlete', () => {
    let result: unknown;
    svc.getRecap('2026-05-18').subscribe((r) => (result = r));
    http
      .expectOne((r) => r.url === '/api/v1/me/recap')
      .flush({ message: 'No athlete profile found.' }, { status: 404, statusText: 'Not Found' });
    expect(result).toEqual({ status: 'no-athlete' });
  });

  it('422 (bad week) collapses to status:bad-week', () => {
    let result: unknown;
    svc.getRecap('2026-bad').subscribe((r) => (result = r));
    http
      .expectOne((r) => r.url === '/api/v1/me/recap')
      .flush(
        { message: 'Malformed week parameter.' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
    expect(result).toEqual({ status: 'bad-week' });
  });

  it('lets a 500 propagate to the error handler', () => {
    let errored = false;
    svc.getRecap('2026-05-18').subscribe({ error: () => (errored = true) });
    http
      .expectOne((r) => r.url === '/api/v1/me/recap')
      .flush({}, { status: 500, statusText: 'Server Error' });
    expect(errored).toBe(true);
  });
});
