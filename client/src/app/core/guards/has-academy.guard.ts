import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { catchError, map, of } from 'rxjs';
import { AcademyService } from '../services/academy.service';

/**
 * Guards the /dashboard route.
 * If the user has no academy yet (404), redirect to /setup.
 * If the user is unauthenticated (401), redirect to /auth/login.
 * Any other error blocks navigation.
 */
export const hasAcademyGuard: CanActivateFn = () => {
  const academyService = inject(AcademyService);
  const router = inject(Router);

  return academyService.get().pipe(
    map(() => true),
    catchError((err: HttpErrorResponse) => {
      if (err.status === 404) return of(router.createUrlTree(['/setup']));
      if (err.status === 401) return of(router.createUrlTree(['/auth/login']));
      return of(false);
    }),
  );
};
