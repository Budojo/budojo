import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AcademyService } from '../services/academy.service';

/**
 * Guards the /dashboard route.
 * If the user has no academy yet, redirect to /setup.
 * If the academy exists, allow access.
 */
export const hasAcademyGuard: CanActivateFn = () => {
  const academyService = inject(AcademyService);
  const router = inject(Router);

  return academyService.get().pipe(
    map(() => true),
    catchError(() => of(router.createUrlTree(['/setup']))),
  );
};
