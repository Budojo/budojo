import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Adds the Sanctum bearer token to every outgoing request when one exists,
 * and intercepts the `verification_required` 403 response from the backend's
 * `verified.api` middleware. The 403 path bounces the user to the profile
 * page with a query flag so the page can render the explainer banner.
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
      if (
        err instanceof HttpErrorResponse &&
        err.status === 403 &&
        (err.error as { message?: string })?.message === 'verification_required'
      ) {
        // Don't await navigation — interceptor must return the error stream
        // promptly so feature handlers see the same 403. The redirect lands
        // in the next tick.
        void router.navigate(['/dashboard/profile'], {
          queryParams: { reason: 'verify_required' },
        });
      }
      return throwError(() => err);
    }),
  );
};
