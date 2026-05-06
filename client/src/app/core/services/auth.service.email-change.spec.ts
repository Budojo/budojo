import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

/**
 * Targeted contract specs for the #476 email-change endpoints. Asserts
 * the wire shape (URL + body) the SPA emits and that
 * `cancelPendingEmailChange` triggers a follow-up `/auth/me` so the
 * cached user signal hydrates after the cancel lands.
 */
describe('AuthService email-change endpoints (#476)', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('requestEmailChange POSTs the new email to /me/email-change', () => {
    service.requestEmailChange('new@example.com').subscribe();

    const req = http.expectOne(`${environment.apiBase}/api/v1/me/email-change`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'new@example.com' });
    req.flush({ message: 'verification_link_sent' });
  });

  it('cancelPendingEmailChange DELETEs and follows up with /auth/me', () => {
    service.cancelPendingEmailChange().subscribe();

    const cancelReq = http.expectOne(`${environment.apiBase}/api/v1/me/email-change`);
    expect(cancelReq.request.method).toBe('DELETE');
    cancelReq.flush(null);

    // Follow-up `/auth/me` round-trip — the service hydrates the
    // cached user signal so the pillola disappears in the same tick.
    const meReq = http.expectOne(`${environment.apiBase}/api/v1/auth/me`);
    expect(meReq.request.method).toBe('GET');
    meReq.flush({
      data: {
        id: 1,
        name: 'Tester',
        email: 'tester@example.com',
        email_verified_at: '2026-01-01T00:00:00Z',
        avatar_url: null,
      },
    });
  });

  it('verifyEmailChange POSTs to the public /email-change/{token}/verify route', () => {
    const token = 'a'.repeat(64);
    service.verifyEmailChange(token).subscribe();

    const req = http.expectOne(`${environment.apiBase}/api/v1/email-change/${token}/verify`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({ message: 'email_change_confirmed' });
  });
});
