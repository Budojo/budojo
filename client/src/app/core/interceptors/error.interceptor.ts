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
 * the user can recover from in-place. API failures are a different class of
 * problem: the server is unreachable or broken, the user CANNOT recover
 * in-place, and the only correct UX is "leave this page". The interceptor
 * scopes the redirect to that exact case.
 *
 * **Status filter.**
 *   - 5xx (500–599) — server-side failures → render `/error`.
 *   - 0 — `HttpErrorResponse.status === 0` means the request never reached the
 *     server (CORS, DNS, network drop, browser refused) → render `/offline`.
 *
 * 4xx errors propagate untouched (component-level handlers — login, form
 * validation, 403 verify_required in the auth interceptor — own them).
 *
 * **`skipLocationChange: true` is load-bearing.** Without it the browser URL
 * bar flips to `/error` (or `/offline`), so the retry button's
 * `document.location.reload()` would only ever reload the error page itself
 * — never the URL the user was actually trying to reach. With the flag, the
 * URL bar stays on the originally requested route while Angular renders the
 * error/offline component; reload returns the user to where they wanted to
 * go and re-fires the failing request, which is the intended retry semantics.
 * `Router.url` still resolves to the rendered route, so the loop guards below
 * keep working unchanged.
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
            void router.navigateByUrl('/offline', { skipLocationChange: true });
          }
        } else if (err.status >= 500 && err.status < 600) {
          if (!router.url.startsWith('/error')) {
            void router.navigateByUrl('/error', { skipLocationChange: true });
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
