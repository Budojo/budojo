import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AcademyService } from './academy.service';
import {
  AuthResponse,
  AuthService,
  ChangePasswordPayload,
  LoginPayload,
  RegisterPayload,
  ResetPasswordPayload,
  User,
} from './auth.service';

const TOKEN_KEY = 'auth_token';

const baseUser = (overrides: Partial<User> = {}): User => ({
  id: 1,
  first_name: 'Mario',
  last_name: 'Rossi',
  full_name: 'Mario Rossi',
  handle: null,
  email: 'mario@example.com',
  email_verified_at: null,
  avatar_url: null,
  pending_email_change: null,
  ...overrides,
});

function bootstrap(preseedToken: string | null = null): {
  svc: AuthService;
  http: HttpTestingController;
  academyClear: ReturnType<typeof vi.fn>;
} {
  localStorage.clear();
  if (preseedToken !== null) localStorage.setItem(TOKEN_KEY, preseedToken);
  const academyClear = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      // Stub only the bit auth.service touches — `clear()` on logout.
      {
        provide: AcademyService,
        useValue: { clear: academyClear } as Pick<AcademyService, 'clear'>,
      },
    ],
  });
  return {
    svc: TestBed.inject(AuthService),
    http: TestBed.inject(HttpTestingController),
    academyClear,
  };
}

describe('AuthService', () => {
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    localStorage.clear();
  });

  // ────────────────────────────────────────────────────────────────
  // Token lifecycle + signal initialisation
  // ────────────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('isLoggedIn() seeds from localStorage — false on empty', () => {
      const { svc } = bootstrap();
      expect(svc.isLoggedIn()).toBe(false);
    });

    it('isLoggedIn() seeds from localStorage — true when a token is present', () => {
      const { svc } = bootstrap('preexisting-token');
      expect(svc.isLoggedIn()).toBe(true);
    });

    it('user() starts null until a request hydrates it', () => {
      const { svc } = bootstrap();
      expect(svc.user()).toBeNull();
    });

    it('isEmailVerified() is false when user is null', () => {
      const { svc } = bootstrap();
      expect(svc.isEmailVerified()).toBe(false);
    });
  });

  describe('getToken / adoptIssuedToken', () => {
    it('getToken() reads the current localStorage value', () => {
      const { svc } = bootstrap('abc-123');
      expect(svc.getToken()).toBe('abc-123');
    });

    it('getToken() returns null when no token is present', () => {
      const { svc } = bootstrap();
      expect(svc.getToken()).toBeNull();
    });

    it('adoptIssuedToken() writes the token AND flips isLoggedIn → true', () => {
      const { svc } = bootstrap();
      expect(svc.isLoggedIn()).toBe(false);
      svc.adoptIssuedToken('m7-invite-token');
      expect(localStorage.getItem(TOKEN_KEY)).toBe('m7-invite-token');
      expect(svc.isLoggedIn()).toBe(true);
    });
  });

  describe('logout()', () => {
    it('clears the token + isLoggedIn + user signals + delegates to academyService.clear()', () => {
      const { svc, academyClear } = bootstrap('tk');
      svc['user'].set(baseUser());
      expect(svc.isLoggedIn()).toBe(true);
      svc.logout();
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(svc.isLoggedIn()).toBe(false);
      expect(svc.user()).toBeNull();
      expect(academyClear).toHaveBeenCalledTimes(1);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Auth flows
  // ────────────────────────────────────────────────────────────────

  describe('register()', () => {
    const payload: RegisterPayload = {
      first_name: 'Mario',
      last_name: 'Rossi',
      email: 'm@example.com',
      password: 'pw1234567890',
      password_confirmation: 'pw1234567890',
      terms_accepted: true,
    };

    it('POSTs /auth/register with the payload, stores token, sets user, flips isLoggedIn', () => {
      const { svc, http } = bootstrap();
      let result: AuthResponse | null = null;
      svc.register(payload).subscribe((r) => (result = r));

      const req = http.expectOne('/api/v1/auth/register');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);

      const response: AuthResponse = { data: baseUser({ id: 42 }), token: 'fresh-token' };
      req.flush(response);

      expect(localStorage.getItem(TOKEN_KEY)).toBe('fresh-token');
      expect(svc.isLoggedIn()).toBe(true);
      expect(svc.user()).toEqual(response.data);
      expect(result).toEqual(response);
    });
  });

  describe('login()', () => {
    const payload: LoginPayload = { email: 'm@example.com', password: 'pw' };

    it('POSTs /auth/login + hydrates token/user/isLoggedIn on success', () => {
      const { svc, http } = bootstrap();
      svc.login(payload).subscribe();

      const req = http.expectOne('/api/v1/auth/login');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      req.flush({ data: baseUser(), token: 'login-token' });

      expect(localStorage.getItem(TOKEN_KEY)).toBe('login-token');
      expect(svc.isLoggedIn()).toBe(true);
      expect(svc.user()).not.toBeNull();
    });

    it('forwards the two_factor_code field when the SPA retries after 2FA prompt', () => {
      const { svc, http } = bootstrap();
      svc.login({ ...payload, two_factor_code: '123456' }).subscribe();
      const req = http.expectOne('/api/v1/auth/login');
      expect(req.request.body).toEqual({ ...payload, two_factor_code: '123456' });
      req.flush({ data: baseUser(), token: 'tk' });
    });
  });

  describe('loadCurrentUser()', () => {
    it('GETs /auth/me, hydrates the user signal, and emits the user', () => {
      const { svc, http } = bootstrap('tk');
      let emitted: User | null = null;
      svc.loadCurrentUser().subscribe((u) => (emitted = u));

      const req = http.expectOne('/api/v1/auth/me');
      expect(req.request.method).toBe('GET');
      const u = baseUser({ id: 7, email_verified_at: '2026-05-22T08:00:00Z' });
      req.flush({ data: u });

      expect(svc.user()).toEqual(u);
      expect(svc.isEmailVerified()).toBe(true);
      expect(emitted).toEqual(u);
    });
  });

  describe('forgotPassword()', () => {
    it('POSTs /auth/forgot-password with { email } and resolves on 202', () => {
      const { svc, http } = bootstrap();
      svc.forgotPassword({ email: 'm@example.com' }).subscribe();
      const req = http.expectOne('/api/v1/auth/forgot-password');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'm@example.com' });
      req.flush(null, { status: 202, statusText: 'Accepted' });
    });
  });

  describe('resetPassword()', () => {
    it('POSTs /auth/reset-password with the full token + email + password payload', () => {
      const { svc, http } = bootstrap();
      const payload: ResetPasswordPayload = {
        email: 'm@example.com',
        token: 't-123',
        password: 'newPw1234567',
        password_confirmation: 'newPw1234567',
      };
      svc.resetPassword(payload).subscribe();
      const req = http.expectOne('/api/v1/auth/reset-password');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      req.flush({ message: 'Password reset.' });
    });
  });

  describe('resendVerificationEmail()', () => {
    it('POSTs /email/verification-notification with an empty body', () => {
      const { svc, http } = bootstrap('tk');
      svc.resendVerificationEmail().subscribe();
      const req = http.expectOne('/api/v1/email/verification-notification');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(null);
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Avatar + profile
  // ────────────────────────────────────────────────────────────────

  describe('uploadAvatar()', () => {
    it('POSTs FormData to /me/avatar and replaces the cached user signal', () => {
      const { svc, http } = bootstrap('tk');
      const file = new File(['x'], 'avatar.png', { type: 'image/png' });
      let emitted: User | null = null;
      svc.uploadAvatar(file).subscribe((u) => (emitted = u));

      const req = http.expectOne('/api/v1/me/avatar');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toBeInstanceOf(FormData);
      const form = req.request.body as FormData;
      expect(form.get('avatar')).toBe(file);

      const u = baseUser({ avatar_url: '/avatars/42.png?v=1' });
      req.flush({ data: u });

      expect(svc.user()).toEqual(u);
      expect(emitted).toEqual(u);
    });
  });

  describe('removeAvatar()', () => {
    it('DELETEs /me/avatar and replaces the cached user signal', () => {
      const { svc, http } = bootstrap('tk');
      svc['user'].set(baseUser({ avatar_url: '/avatars/42.png' }));
      svc.removeAvatar().subscribe();

      const req = http.expectOne('/api/v1/me/avatar');
      expect(req.request.method).toBe('DELETE');
      req.flush({ data: baseUser({ avatar_url: null }) });

      expect(svc.user()?.avatar_url).toBeNull();
    });
  });

  describe('updateProfile()', () => {
    it('PATCHes /me with the editable fields and replaces the cached user', () => {
      const { svc, http } = bootstrap('tk');
      const payload = { first_name: 'Mario', last_name: 'Bianchi', handle: 'mario.b' };
      svc.updateProfile(payload).subscribe();

      const req = http.expectOne('/api/v1/me');
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual(payload);

      const u = baseUser({ last_name: 'Bianchi', full_name: 'Mario Bianchi', handle: 'mario.b' });
      req.flush({ data: u });
      expect(svc.user()).toEqual(u);
    });

    it('accepts null handle to clear the field', () => {
      const { svc, http } = bootstrap('tk');
      svc.updateProfile({ first_name: 'Mario', last_name: 'Rossi', handle: null }).subscribe();
      const req = http.expectOne('/api/v1/me');
      expect(req.request.body).toEqual({ first_name: 'Mario', last_name: 'Rossi', handle: null });
      req.flush({ data: baseUser({ handle: null }) });
    });
  });

  describe('changePassword()', () => {
    it('POSTs /me/password with the current/new/confirmation triple', () => {
      const { svc, http } = bootstrap('tk');
      const payload: ChangePasswordPayload = {
        current_password: 'old',
        password: 'newPw1234567',
        password_confirmation: 'newPw1234567',
      };
      svc.changePassword(payload).subscribe();
      const req = http.expectOne('/api/v1/me/password');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(payload);
      req.flush({ message: 'Password updated.' });
    });
  });

  // ────────────────────────────────────────────────────────────────
  // Email change (#476)
  // ────────────────────────────────────────────────────────────────

  describe('requestEmailChange()', () => {
    it('POSTs /me/email-change with { email } and does NOT mutate the user signal', () => {
      const { svc, http } = bootstrap('tk');
      svc['user'].set(baseUser({ email: 'old@example.com' }));
      svc.requestEmailChange('new@example.com').subscribe();

      const req = http.expectOne('/api/v1/me/email-change');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ email: 'new@example.com' });
      req.flush({ message: 'Verification email sent.' });

      // The cached email MUST stay on the old address until the
      // verify link is clicked — otherwise the UI would lie about
      // the user's identity for the entire grace window.
      expect(svc.user()?.email).toBe('old@example.com');
    });
  });

  describe('cancelPendingEmailChange()', () => {
    it('DELETEs /me/email-change and chains a loadCurrentUser to refresh the pillola', () => {
      const { svc, http } = bootstrap('tk');
      svc.cancelPendingEmailChange().subscribe();

      const delReq = http.expectOne(
        (r) => r.method === 'DELETE' && r.url.endsWith('/me/email-change'),
      );
      delReq.flush(null, { status: 204, statusText: 'No Content' });

      // The chained loadCurrentUser fires AFTER the DELETE resolves.
      const meReq = http.expectOne('/api/v1/auth/me');
      expect(meReq.request.method).toBe('GET');
      meReq.flush({ data: baseUser({ pending_email_change: null }) });

      expect(svc.user()?.pending_email_change).toBeNull();
    });
  });

  describe('verifyEmailChange()', () => {
    it('POSTs /email-change/<token>/verify with an empty body (public, no Sanctum)', () => {
      const { svc, http } = bootstrap();
      svc.verifyEmailChange('verify-token-abc').subscribe();
      const req = http.expectOne('/api/v1/email-change/verify-token-abc/verify');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({ message: 'Email updated.' });
    });

    it('does NOT mutate the user signal (verify never auto-logs-in)', () => {
      const { svc, http } = bootstrap();
      svc.verifyEmailChange('tk').subscribe();
      http.expectOne('/api/v1/email-change/tk/verify').flush({ message: 'Email updated.' });
      expect(svc.user()).toBeNull();
    });
  });

  // ────────────────────────────────────────────────────────────────
  // exportMyData() — GDPR Art. 20 (#222)
  // ────────────────────────────────────────────────────────────────

  describe('exportMyData()', () => {
    it('GETs /me/export?format=zip by default and parses filename from Content-Disposition', () => {
      const { svc, http } = bootstrap('tk');
      let result: { blob: Blob; filename: string } | undefined;
      svc.exportMyData().subscribe((r) => (result = r));

      const req = http.expectOne('/api/v1/me/export?format=zip');
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');

      const blob = new Blob(['contents']);
      req.flush(blob, {
        headers: { 'Content-Disposition': 'attachment; filename="budojo-export-2026-05-22.zip"' },
      });

      expect(result?.blob).toBeInstanceOf(Blob);
      expect(result?.filename).toBe('budojo-export-2026-05-22.zip');
    });

    it('omits the query string when format=json is requested explicitly', () => {
      const { svc, http } = bootstrap('tk');
      let result: { blob: Blob; filename: string } | undefined;
      svc.exportMyData('json').subscribe((r) => (result = r));

      const req = http.expectOne('/api/v1/me/export');
      expect(req.request.method).toBe('GET');
      expect(req.request.responseType).toBe('blob');
      req.flush(new Blob(['{}']), {
        headers: { 'Content-Disposition': 'attachment; filename="data.json"' },
      });

      expect(result?.blob).toBeInstanceOf(Blob);
      expect(result?.filename).toBe('data.json');
    });

    it('falls back to a sensible filename when Content-Disposition is missing (zip)', () => {
      const { svc, http } = bootstrap('tk');
      let result: { blob: Blob; filename: string } | undefined;
      svc.exportMyData('zip').subscribe((r) => (result = r));
      http.expectOne('/api/v1/me/export?format=zip').flush(new Blob([]));
      expect(result?.filename).toBe('budojo-export.zip');
    });

    it('falls back to a sensible filename when Content-Disposition is missing (json)', () => {
      const { svc, http } = bootstrap('tk');
      let result: { blob: Blob; filename: string } | undefined;
      svc.exportMyData('json').subscribe((r) => (result = r));
      http.expectOne('/api/v1/me/export').flush(new Blob([]));
      expect(result?.filename).toBe('budojo-export.json');
    });

    it('falls back to the format-aware default when the header is malformed', () => {
      const { svc, http } = bootstrap('tk');
      let result: { blob: Blob; filename: string } | undefined;
      svc.exportMyData('zip').subscribe((r) => (result = r));
      http
        .expectOne('/api/v1/me/export?format=zip')
        .flush(new Blob([]), { headers: { 'Content-Disposition': 'inline' } });
      expect(result?.filename).toBe('budojo-export.zip');
    });
  });
});
