import { HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

/**
 * Auth interceptor — focused coverage on the role_required branch added
 * in #774 (M7 PR-F). The legacy verification_required + 401 logout paths
 * are spot-checked alongside to guard against regressions during the
 * branch expansion.
 */

interface Harness {
  http: HttpClient;
  mock: HttpTestingController;
  router: Router;
  logoutSpy: ReturnType<typeof vi.fn>;
}

function setup(token: string | null = 'fake-token'): Harness {
  const logoutSpy = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([authInterceptor as HttpInterceptorFn])),
      provideHttpClientTesting(),
      provideRouter([]),
      {
        provide: AuthService,
        useValue: { getToken: () => token, logout: logoutSpy },
      },
    ],
  });
  return {
    http: TestBed.inject(HttpClient),
    mock: TestBed.inject(HttpTestingController),
    router: TestBed.inject(Router),
    logoutSpy,
  };
}

describe('authInterceptor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('attaches the Bearer token to outgoing requests when present', () => {
    const { http, mock } = setup('abc.def');
    http.get('/api/v1/auth/me').subscribe({ next: () => undefined, error: () => undefined });
    const req = mock.expectOne('/api/v1/auth/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc.def');
    req.flush({});
  });

  it('on 403 role_required redirects to the athlete-portal home', () => {
    // #774 / M7 PR-F: an athlete-role user who somehow hits an owner-only
    // route gets a stable 403 from the server. The SPA's route guards
    // already gate the same surfaces, so this is the edge-case lifeboat
    // (curl, stale tab, race between role change and navigation).
    const { http, mock, router } = setup('any');
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    http.get('/api/v1/athletes').subscribe({
      next: () => undefined,
      error: () => undefined,
    });

    mock
      .expectOne('/api/v1/athletes')
      .flush({ message: 'role_required' }, { status: 403, statusText: 'Forbidden' });

    expect(navigateSpy).toHaveBeenCalledWith('/dashboard/me/profile');
  });

  it('on 403 verification_required redirects to the profile page with reason flag', () => {
    const { http, mock, router } = setup('any');
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    http.get('/api/v1/athletes').subscribe({
      next: () => undefined,
      error: () => undefined,
    });

    mock
      .expectOne('/api/v1/athletes')
      .flush({ message: 'verification_required' }, { status: 403, statusText: 'Forbidden' });

    expect(navigateSpy).toHaveBeenCalledWith(['/dashboard/profile'], {
      queryParams: { reason: 'verify_required' },
    });
  });

  it('on 401 with a token logs out and bounces to /auth/login', () => {
    const { http, mock, router, logoutSpy } = setup('expired');
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    http.get('/api/v1/auth/me').subscribe({
      next: () => undefined,
      error: () => undefined,
    });

    mock.expectOne('/api/v1/auth/me').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(logoutSpy).toHaveBeenCalled();
    expect(navigateSpy).toHaveBeenCalledWith('/auth/login');
  });

  it('on 401 without a token does NOT log out (legitimate pre-auth response)', () => {
    const { http, mock, logoutSpy } = setup(null);

    http.post('/api/v1/auth/login', {}).subscribe({
      next: () => undefined,
      error: () => undefined,
    });

    mock
      .expectOne('/api/v1/auth/login')
      .flush({ message: 'Invalid credentials.' }, { status: 401, statusText: 'Unauthorized' });

    expect(logoutSpy).not.toHaveBeenCalled();
  });
});
