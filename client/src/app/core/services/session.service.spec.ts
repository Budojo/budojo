import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActiveSession, SessionService } from './session.service';

describe('SessionService (#413)', () => {
  let svc: SessionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GETs /me/sessions and unwraps the data array', () => {
    let result: readonly ActiveSession[] | null = null;
    svc.list().subscribe((rows) => (result = rows));

    const req = http.expectOne('/api/v1/me/sessions');
    expect(req.request.method).toBe('GET');

    const data: readonly ActiveSession[] = [
      {
        id: 1,
        name: 'Chrome on macOS',
        last_used_at: '2026-05-21T08:00:00Z',
        created_at: '2026-05-01T09:00:00Z',
        is_current: true,
      },
      {
        id: 2,
        name: 'Safari on iOS',
        last_used_at: null,
        created_at: null,
        is_current: false,
      },
    ];
    req.flush({ data });
    expect(result).toEqual(data);
  });

  it('DELETEs /me/sessions/<id> to revoke a single session', () => {
    svc.revoke(7).subscribe();
    const req = http.expectOne('/api/v1/me/sessions/7');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('DELETEs /me/sessions (no id) and unwraps the revoked count', () => {
    let result: number | null = null;
    svc.revokeOthers().subscribe((n) => (result = n));

    const req = http.expectOne('/api/v1/me/sessions');
    expect(req.request.method).toBe('DELETE');
    req.flush({ data: { revoked: 3 } });

    expect(result).toBe(3);
  });

  it('revokeOthers resolves to 0 when no other sessions existed', () => {
    let result: number | null = null;
    svc.revokeOthers().subscribe((n) => (result = n));
    http.expectOne('/api/v1/me/sessions').flush({ data: { revoked: 0 } });
    expect(result).toBe(0);
  });
});
