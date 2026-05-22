import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { LoginAttempt, LoginHistoryService } from './login-history.service';

describe('LoginHistoryService (#430)', () => {
  let svc: LoginHistoryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(LoginHistoryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GETs /api/v1/me/login-history and unwraps the data array', () => {
    let result: readonly LoginAttempt[] | null = null;
    svc.list().subscribe((rows) => (result = rows));

    const req = http.expectOne('/api/v1/me/login-history');
    expect(req.request.method).toBe('GET');

    const data: readonly LoginAttempt[] = [
      {
        id: 1,
        success: true,
        device: 'Chrome on macOS',
        ip_address: '203.0.113.4',
        created_at: '2026-05-21T08:00:00Z',
      },
      {
        id: 2,
        success: false,
        device: 'Unknown device',
        ip_address: null,
        created_at: '2026-05-20T22:00:00Z',
      },
    ];
    req.flush({ data });

    expect(result).toEqual(data);
  });

  it('returns an empty array when the server reports no attempts yet', () => {
    let result: readonly LoginAttempt[] | null = null;
    svc.list().subscribe((rows) => (result = rows));
    http.expectOne('/api/v1/me/login-history').flush({ data: [] });
    expect(result).toEqual([]);
  });
});
