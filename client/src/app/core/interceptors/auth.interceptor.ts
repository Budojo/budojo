import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Adds the Sanctum bearer token to every outgoing request when one exists,
 * and intercepts two server-driven session-state responses:
 *
 * - **403 `verification_required`**: bounces the user to the profile page
 *   with a query flag so the page can render the verify-email banner.
 * - **401 Unauthenticated**: clears the bearer token from local storage
 *   and redirects to `/auth/login`. This handles the "your session was
 *   revoked elsewhere" case — e.g. the user changed their password on
 *   another tab (#409) and that tab's request fires after the server has
 *   already invalidated this session's row. Without this, the SPA would
 *   sit in a broken authenticated shell rendering 401-failing requests
 *   until a feature-specific error happened to surface the problem.
 *
 * Other 4xx/5xx errors propagate untouched — feature-level error handlers
 * are responsible for them.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.getToken();

  const outgoing = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(outgoing).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        if (
          err.status === 403 &&
          (err.error as { message?: string })?.message === 'verification_required'
        ) {
          // Don't await navigation — interceptor must return the error stream
          // promptly so feature handlers see the same 403. The redirect lands
          // in the next tick.
          void router.navigate(['/dashboard/profile'], {
            queryParams: { reason: 'verify_required' },
          });
        } else if (err.status === 401 && token !== null) {
          // The token was rejected by the server — most commonly because
          // it was revoked from another tab/device after a password
          // rotation (#409). Tear down local session state (mirrors the
          // user-initiated `Sign out` path) and bounce to login.
          // Skipped when no token was attached, because that 401 is a
          // legitimate "you're not authenticated yet" response a feature
          // (e.g. the login form itself) wants to handle inline.
          auth.logout();
          if (!router.url.startsWith('/auth/')) {
            void router.navigateByUrl('/auth/login');
          }
        }
      }
      return throwError(() => err);
    }),
  );
};
