import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

/**
 * 5xx + network-error redirect interceptor (#425).
 *
 * **Why an HttpInterceptor and not a global ErrorHandler?**
 * An `ErrorHandler` catches *every* uncaught Angular runtime error — null
 * dereferences in templates, RxJS `throw` from feature code, change-detection
 * exceptions. Routing those to `/error` would over-trigger the page on bugs
 * the user can recover from in-place (e.g. a stats chart that fails to render
 * but where the rest of the dashboard is fine). API failures are a different
 * class of problem: the server is unreachable or broken, the user CANNOT
 * recover here, and the only correct UX is "leave this page". The interceptor
 * scopes the redirect to that exact case.
 *
 * **Status filter.** We redirect on:
 *   - 5xx (500–599) — server-side failures.
 *   - 0 — `HttpErrorResponse.status === 0` means the request never reached the
 *     server (CORS, DNS, network drop, browser refused). Routed to the offline
 *     page instead, since the most common cause is "user is offline".
 *
 * 4xx errors propagate untouched (component-level handlers — login, form
 * validation, 403 verify_required in the auth interceptor — own them).
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        if (err.status === 0) {
          // `status === 0` is browser-emitted — request never reached the
          // server. Most common cause is a network drop; the offline page
          // matches the user's mental model better than a generic error.
          // Avoid bouncing if we're already there (a refresh on /offline
          // that fails again would otherwise loop).
          if (!router.url.startsWith('/offline')) {
            void router.navigateByUrl('/offline');
          }
        } else if (err.status >= 500 && err.status < 600) {
          if (!router.url.startsWith('/error')) {
            void router.navigateByUrl('/error');
          }
        }
      }
      // Always re-throw so feature handlers + the auth interceptor see
      // the same error. The redirect above is a UX side-effect, not a
      // swallow.
      return throwError(() => err);
    }),
  );
};
