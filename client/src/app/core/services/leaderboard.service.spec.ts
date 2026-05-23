import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import {
  LeaderboardPage,
  LeaderboardResult,
  LeaderboardService,
} from './leaderboard.service';

const URL = `${environment.apiBase}/api/v1/attendance/leaderboard`;

function makePage(): LeaderboardPage {
  return {
    data: [
      {
        rank: 1,
        athlete_id: 42,
        first_name: 'Mario',
        last_name_initial: 'R',
        sessions: 12,
        hours: 18,
        anonymous: false,
        is_self: true,
      },
    ],
    meta: { month: '2026-05' },
  };
}

describe('LeaderboardService (#962)', () => {
  let httpMock: HttpTestingController;
  let service: LeaderboardService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(LeaderboardService);
  });

  afterEach(() => httpMock.verify());

  it('GETs /api/v1/attendance/leaderboard with no month param by default', () => {
    let result: LeaderboardResult | undefined;
    service.getLeaderboard().subscribe((r) => (result = r));

    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.has('month')).toBe(false);

    const page = makePage();
    req.flush(page);

    expect(result).toEqual({ status: 'ok', page });
  });

  it('forwards the month param when set (drilldown to a specific month)', () => {
    service.getLeaderboard('2026-03').subscribe();

    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('month')).toBe('2026-03');
    req.flush(makePage());
  });

  it('maps 404 to a discriminated `no-academy` result (orphan athlete)', () => {
    let result: LeaderboardResult | undefined;
    service.getLeaderboard().subscribe((r) => (result = r));

    httpMock
      .expectOne((r) => r.url === URL)
      .flush({ message: 'No academy.' }, { status: 404, statusText: 'Not Found' });

    expect(result).toEqual({ status: 'no-academy' });
  });

  it('maps 422 to a discriminated `bad-month` result (malformed month param)', () => {
    let result: LeaderboardResult | undefined;
    service.getLeaderboard('2026-13').subscribe((r) => (result = r));

    httpMock
      .expectOne((r) => r.url === URL)
      .flush({ message: 'Invalid month.' }, { status: 422, statusText: 'Unprocessable Entity' });

    expect(result).toEqual({ status: 'bad-month' });
  });

  it('rethrows non-404/422 errors so the caller can surface them', () => {
    let caught: HttpErrorResponse | undefined;
    service.getLeaderboard().subscribe({
      next: () => {},
      error: (err: HttpErrorResponse) => (caught = err),
    });

    httpMock
      .expectOne((r) => r.url === URL)
      .flush({ message: 'Boom.' }, { status: 500, statusText: 'Server Error' });

    expect(caught).toBeInstanceOf(HttpErrorResponse);
    expect(caught?.status).toBe(500);
  });
});
