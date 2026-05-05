import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

/**
 * Network-error redirect interceptor (#425).
 *
 * **Scope: `status === 0` only.** A `status === 0` `HttpErrorResponse` means
 * the request never reached the server — CORS, DNS, network drop, browser
 * refused. That's a global condition (the *whole* app is offline, not just
 * this one call), so a full-page takeover to `/offline` is the right UX:
 * the user cannot meaningfully recover by retrying any single component.
 *
 * **Why we do NOT auto-redirect on 5xx.** Server-side errors are usually
 * scoped to the specific endpoint that failed — a stats endpoint 500-ing
 * should not throw the user out of the dashboard. The codebase has spent
 * years wiring component-level 5xx handlers (toasts on save failures,
 * empty-state cards on list failures, etc.); a global redirect would
 * silently break all of those by replacing the rendered component before
 * the local handler can react. Components keep ownership of 5xx; the
 * `/error` page is still routable for direct navigation but no longer
 * the destination of a global redirect.
 *
 * 4xx errors propagate untouched (component-level handlers — login, form
 * validation, 403 verify_required in the auth interceptor — own them).
 *
 * **`skipLocationChange: true` is load-bearing.** Without it the browser
 * URL bar flips to `/offline`, so the retry button's
 * `document.location.reload()` (and the auto-recovery effect on
 * reconnect) would only ever reload the offline page itself — never the
 * URL the user was actually trying to reach. With the flag, the URL bar
 * stays on the originally requested route while Angular renders
 * `<app-offline>`; reload returns the user to where they wanted to go
 * and re-fires the failing request. `Router.url` still resolves to the
 * rendered route, so the loop guard below keeps working unchanged.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 0) {
        // Avoid bouncing if we're already there (a refresh on /offline
        // that fails again would otherwise loop).
        if (!router.url.startsWith('/offline')) {
          void router.navigateByUrl('/offline', { skipLocationChange: true });
        }
      }
      // Always re-throw so feature handlers + the auth interceptor see
      // the same error. The redirect above is a UX side-effect, not a
      // swallow.
      return throwError(() => err);
    }),
  );
};
