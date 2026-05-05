import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { errorInterceptor } from './error.interceptor';

interface RouterStub {
  navigateByUrl: ReturnType<typeof vi.fn>;
  url: string;
}

function setup(initialUrl = '/dashboard/athletes'): {
  http: HttpClient;
  httpMock: HttpTestingController;
  router: RouterStub;
} {
  const router: RouterStub = {
    navigateByUrl: vi.fn().mockResolvedValue(true),
    url: initialUrl,
  };
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([errorInterceptor])),
      provideHttpClientTesting(),
      { provide: Router, useValue: router },
    ],
  });
  return {
    http: TestBed.inject(HttpClient),
    httpMock: TestBed.inject(HttpTestingController),
    router,
  };
}

describe('errorInterceptor', () => {
  it.each([500, 501, 502, 503, 504, 599])('redirects to /error on HTTP %i', (status) => {
    const { http, httpMock, router } = setup();
    let received: unknown;
    http.get('/api/v1/anything').subscribe({
      next: () => undefined,
      error: (err) => (received = err),
    });

    httpMock
      .expectOne('/api/v1/anything')
      .flush({ message: 'boom' }, { status, statusText: 'Server Error' });

    // `skipLocationChange: true` keeps the browser URL bar on the originally
    // failing route so the retry button's `location.reload()` actually re-fires
    // the request the user wanted, not the error page itself.
    expect(router.navigateByUrl).toHaveBeenCalledWith('/error', { skipLocationChange: true });
    // Error is re-thrown so feature handlers can still respond.
    expect(received).toBeDefined();
    httpMock.verify();
  });

  it('redirects to /offline on a network error (status 0)', () => {
    const { http, httpMock, router } = setup();
    http.get('/api/v1/anything').subscribe({
      next: () => undefined,
      error: () => undefined,
    });

    httpMock
      .expectOne('/api/v1/anything')
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    expect(router.navigateByUrl).toHaveBeenCalledWith('/offline', { skipLocationChange: true });
    httpMock.verify();
  });

  it.each([400, 401, 403, 404, 422])(
    'does NOT redirect on HTTP %i — feature handlers own 4xx',
    (status) => {
      const { http, httpMock, router } = setup();
      http.get('/api/v1/anything').subscribe({
        next: () => undefined,
        error: () => undefined,
      });

      httpMock
        .expectOne('/api/v1/anything')
        .flush({ message: 'nope' }, { status, statusText: 'Client Error' });

      expect(router.navigateByUrl).not.toHaveBeenCalled();
      httpMock.verify();
    },
  );

  it('does not bounce when already on /error (avoids redirect loops on a 5xx during /error itself)', () => {
    const { http, httpMock, router } = setup('/error');
    http.get('/api/v1/anything').subscribe({
      next: () => undefined,
      error: () => undefined,
    });

    httpMock
      .expectOne('/api/v1/anything')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    httpMock.verify();
  });

  it('does not bounce when already on /offline (avoids redirect loops on a network-fail retry)', () => {
    const { http, httpMock, router } = setup('/offline');
    http.get('/api/v1/anything').subscribe({
      next: () => undefined,
      error: () => undefined,
    });

    httpMock
      .expectOne('/api/v1/anything')
      .error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    httpMock.verify();
  });

  it('re-throws the original error so downstream subscribers still see it', () => {
    const { http, httpMock } = setup();
    let received: unknown;
    http.get('/api/v1/anything').subscribe({
      next: () => undefined,
      error: (err) => (received = err),
    });

    httpMock
      .expectOne('/api/v1/anything')
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });

    expect(received).toBeDefined();
    httpMock.verify();
  });
});
